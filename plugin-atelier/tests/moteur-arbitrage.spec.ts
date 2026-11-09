/**
 * Moteur de missions (#56) : clés de transition et de réveil par cycle de blocage. Une mission jamais bloquée garde ses clés
 * d'origine ; après une sortie de blocage (compteur `cycleBlocage`), les clés portent `:c<n>` et un nouvel événement s'applique.
 */
import { describe, expect, it } from "vitest";
import type { CrmMoteur } from "../src/moteur/export-crm.js";
import { P1, P2, P3, SOC, SOURCE_COLLECTE, jusquAutorisation, monter, LIMITES } from "./moteur-wf01-doubles.js";

type Banc = Awaited<ReturnType<typeof monter>>;

/** Sortie de blocage telle que la fait la base (le compteur monte), puis la mission repart du début : étape 1 non démarrée. */
async function repartir(t: Banc) {
  t.missions.get(t.missionId)!.etat = "blocage";
  expect(await t.base.changerEtatMission(SOC, t.missionId, "blocage", "prete")).toBe(true);
  t.missions.get(t.missionId)!.rangCourant = 0;
  t.etapes.find((e) => e.rang === 1)!.etat = "en_attente";
}

describe("clés par cycle de blocage", () => {
  it("sans blocage, toutes les clés gardent leur forme actuelle", async () => {
    const t = await jusquAutorisation();
    expect([...t.executions.keys()].map((k) => k.slice(SOC.length + 1))).toEqual([
      "mission-1:2:1:creation_tache", "mission-1:4:1:creation_tache", "mission-1:5:1:creation_tache", "mission-1:7:1:creation_tache", "mission-1:7:1:pose_porte",
      "mission-1:1:1:demarrage", "mission-1:1:1:sortie_valide_etape", "mission-1:2:1:demarrage", "mission-1:2:1:reveil:etape", "mission-1:2:1:sortie_valide_etape",
      "mission-1:3:1:demarrage", "mission-1:3:1:sortie_valide_etape", "mission-1:4:1:demarrage", "mission-1:4:1:reveil:etape", "mission-1:4:1:sortie_valide_etape",
      "mission-1:5:1:demarrage", "mission-1:5:1:reveil:etape", "mission-1:5:1:sortie_valide_etape", "mission-1:6:1:demarrage", "mission-1:6:1:sortie_valide_etape",
      "mission-1:7:1:demarrage", "mission-1:7:1:reveil:etape", "mission-1:7:1:sortie_valide_sous_porte", "mission-1:7:1:porte_franchie:run-r1",
    ]);
  });

  it("un second blocage après une reprise s'applique et réveille de nouveau le coordinateur", async () => {
    const t = await monter();
    // Rang 2 : la première étape d'agent, la seule à avoir une tâche à réécrire (les rangs 1, 3 et 6 sont en code).
    Object.assign(t.missions.get(t.missionId)!, { contratVersion: 99, rangCourant: 2 });
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.reveils).toHaveLength(1);
    expect(await t.base.changerEtatMission(SOC, t.missionId, "blocage", "prete")).toBe(true);
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.journal.filter((j) => j.type === "moteur.blocage")).toHaveLength(2);
    expect(t.reveils).toHaveLength(2);
    expect(t.commentaires.filter((c) => c.body.includes("contrat_invalide"))).toHaveLength(2);
  });

  it("blocage au rang 1 (étape en code, aucune tâche avant) : tâche d'arbitrage au coordinateur, un seul réveil", async () => {
    const t = await monter();
    Object.assign(t.missions.get(t.missionId)!, { contratVersion: 99, rangCourant: 1 });
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.journal.some((j) => j.type === "moteur.blocage_sans_reveil")).toBe(false);
    const arbitrages = [...t.issues.values()].filter((i) => i.originId === `mission:${t.missionId}:1:arbitrage`);
    expect(arbitrages).toHaveLength(1);
    expect(arbitrages[0]).toMatchObject({ assigneeAgentId: "agent-coordinateur", status: "todo" });
    expect(arbitrages[0]!.description).toContain("arbitrage_deposer");
    expect(t.reveils).toHaveLength(1);
  });
  it("un second demarrage et un second entree_manquante après une reprise s'appliquent", async () => {
    const demarre = await monter();
    await demarre.executeur.demarrerMission(SOC, demarre.missionId);
    expect(demarre.missions.get(demarre.missionId)!.etat).toBe("en_cours");
    // Le rang 1 est en code : il se termine tout de suite et la mission repart sur la tâche du rang 2.
    expect(demarre.reveils.filter((r) => r === demarre.issueDuRang(2))).toHaveLength(1);
    await repartir(demarre);
    await demarre.executeur.reprendre(SOC);
    expect(demarre.missions.get(demarre.missionId)!.etat).toBe("en_cours");
    expect(demarre.reveils.filter((r) => r === demarre.issueDuRang(2))).toHaveLength(2);

    const manquant = await monter({ entrees: {} });
    await manquant.executeur.demarrerMission(SOC, manquant.missionId);
    expect(manquant.missions.get(manquant.missionId)!.etat).toBe("attente_information");
    await repartir(manquant);
    await manquant.executeur.reprendre(SOC);
    expect(manquant.missions.get(manquant.missionId)!.etat).toBe("attente_information");
  });
});

describe("sortie de blocage : reprise de l'arbitrage", () => {
  it("reprise au rang 9 : en_execution, jamais contrat_invalide", async () => {
    const crm: CrmMoteur = { existe: async () => false, confirme: async () => false, ecrire: async () => ({ etat: "bloquee", raison: "appel_introuvable", motif: null }) };
    const t = await jusquAutorisation({ crm });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("blocage");
    expect(t.missions.get(t.missionId)!.rangCourant).toBe(9);
    crm.ecrire = async () => ({ etat: "en_attente", appelId: "appel-1", consigne: null });
    expect(await t.executeur.sortirDeBlocage(SOC, t.missionId)).toBe(true);
    expect(t.etat()).toBe("en_execution");
    expect(t.journal.some((j) => j.type === "moteur.blocage" && j.donnees?.evenement === "contrat_invalide")).toBe(false);
    expect([...t.executions.keys()].some((k) => k.endsWith(":9:1:arbitrage_repris_effet"))).toBe(true);
  });

  it("avant la porte : assigné de l'étape rétabli, réveil unique, aucun réveil du coordinateur", async () => {
    const t = await monter();
    Object.assign(t.missions.get(t.missionId)!, { contratVersion: 99, rangCourant: 2 });
    await t.executeur.reprendre(SOC);
    const tache = t.issueDuRang(2);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.issues.get(tache)).toMatchObject({ assigneeAgentId: "agent-coordinateur", status: "blocked" });
    const avant = t.reveils.length;
    t.missions.get(t.missionId)!.contratVersion = 1;
    expect(await t.executeur.sortirDeBlocage(SOC, t.missionId)).toBe(true);
    expect(t.issues.get(tache)).toMatchObject({ assigneeAgentId: `agent-${t.etapes.find((e) => e.rang === 2)!.role}`, status: "todo" });
    expect(t.reveils.slice(avant)).toEqual([tache]);
    expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
  });

  it("collecte vide, arbitrage repris : le rang 2 redépose et la mission repart", async () => {
    const opts: { collecte: string[] } = { collecte: [] };
    const t = await monter(opts);
    await t.executeur.demarrerMission(SOC, t.missionId);
    await t.deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: [P1, P2, P3, P1], limites: LIMITES });
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "blocage", rangCourant: 3 });
    const collecte = t.issueDuRang(2);
    // La tâche de collecte est déjà `done` : une tâche d'arbitrage dédiée porte le blocage.
    const arbitrage = [...t.issues.values()].find((i) => i.originId === `mission:${t.missionId}:3:arbitrage`)!;
    expect(arbitrage).toMatchObject({ assigneeAgentId: "agent-coordinateur", status: "todo" });
    expect(String(arbitrage.description)).toContain("arbitrage_deposer");
    expect(String(arbitrage.description)).not.toContain("decision_demander");
    opts.collecte = [SOURCE_COLLECTE];
    const avant = t.reveils.length;
    expect(await t.executeur.sortirDeBlocage(SOC, t.missionId)).toBe(true);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
    expect(t.issues.get(collecte)).toMatchObject({ assigneeAgentId: `agent-${t.etapes.find((e) => e.rang === 2)!.role}`, status: "todo" });
    expect(t.reveils.slice(avant)).toEqual([collecte]);
    expect(arbitrage.status).toBe("done");
    await t.deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: [P1, P2, P3, P1], limites: LIMITES });
    expect(t.etapes.find((e) => e.rang === 3)).toMatchObject({ etat: "terminee" });
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 4 });
  });
});

describe("réveil refusé par l'hôte", () => {
  it("reveil_refuse_par_l_hote_reste_a_rejouer", async () => {
    const t = await monter();
    const vrai = t.hote.issues.requestWakeup;
    t.hote.issues.requestWakeup = async () => ({ queued: false, runId: null }) as never;
    await t.executeur.demarrerMission(SOC, t.missionId);
    const cle = [...t.executions.keys()].find((k) => k.endsWith(":2:1:reveil:etape"))!;
    expect(t.executions.get(cle)!.statut).toBe("demandee");
    expect(t.executionsDemandees().map((x) => x.cle)).toContain(cle.slice(SOC.length + 1));
    expect(t.reveils).toEqual([]);
    t.hote.issues.requestWakeup = vrai;
    await t.executeur.reprendre(SOC);
    expect(t.executions.get(cle)!.statut).toBe("appliquee");
    expect(t.reveils).toEqual([t.issueDuRang(2)]);
  });
});
