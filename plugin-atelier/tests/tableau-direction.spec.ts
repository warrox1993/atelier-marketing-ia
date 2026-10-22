/**
 * Calculs du tableau de direction (module pur) : entonnoir et taux de passage, « non mesuré » quand une source manque
 * (jamais 0), « connexion à faire » pour la captation et l'e-mailing, coût par prospect qualifié (abonnement compris),
 * délais par phase, délai de décision, comparaison au mois précédent, liste des sources à connecter.
 */
import { describe, expect, it } from "vitest";
import { delaisParPhase, libelleDuree, mediane, moisPrecedent, moyenne, part, tableauDirection, titreCourt, variation } from "../src/ui/tableau-direction.js";
import { coutFictif, directionFictive, rapportFictif } from "./outils-tableau.js";

const cle = <T extends { cle: string }>(l: readonly T[], k: string) => l.find((x) => x.cle === k)!;

describe("briques", () => {
  it("mois précédent, y compris au changement d'année", () => {
    expect(moisPrecedent("2026-10")).toBe("2026-09");
    expect(moisPrecedent("2027-01")).toBe("2026-12");
  });
  it("variation : hausse, baisse, stable, précédent nul, source absente", () => {
    expect(variation(12, 8)).toEqual({ precedent: 8, ecart: 4, pourcent: 50, sens: "hausse" });
    expect(variation(6, 8)?.sens).toBe("baisse");
    expect(variation(8, 8)?.sens).toBe("stable");
    expect(variation(3, 0)).toMatchObject({ pourcent: null, sens: "hausse" });
    expect(variation(null, 8)).toBeNull();
    expect(variation(8, null)).toBeNull();
  });
  it("part, moyenne, médiane : null sans donnée ou diviseur nul", () => {
    expect(part(5, 20)).toBe(25);
    expect(part(5, 0)).toBeNull();
    expect(part(null, 20)).toBeNull();
    expect(moyenne([])).toBeNull();
    expect(moyenne([2, 4])).toBe(3);
    expect(mediane([])).toBeNull();
    expect(mediane([30, 2, 4])).toBe(4);
    expect(mediane([1, 2, 3, 10])).toBe(2.5);
  });
  it("titre court : coupé à 72 caractères avec un point de suspension, espaces normalisés", () => {
    expect(titreCourt("Mission   simple")).toBe("Mission simple");
    const long = titreCourt("x".repeat(200));
    expect(long).toHaveLength(72);
    expect(long.endsWith("\u2026")).toBe(true);
  });
  it("durées lisibles", () => {
    expect(libelleDuree(0.5)).toBe("30 min");
    expect(libelleDuree(5.5)).toBe("5,5 h");
    expect(libelleDuree(72)).toBe("3 j");
  });
});

describe("entonnoir", () => {
  const t = tableauDirection("2026-10", { rapport: rapportFictif(), direction: directionFictive() }, null);
  it("six étapes dans l'ordre, avec leurs valeurs et sources", () => {
    expect(t.entonnoir.map((e) => e.cle)).toEqual(["trouves", "avec_numero", "fiables", "contactes", "rendez_vous", "clients_gagnes"]);
    expect(t.entonnoir.map((e) => e.valeur)).toEqual([100, 60, 20, 30, 6, 2]);
    expect(cle(t.entonnoir, "contactes").source).toBe("mesures importées");
  });
  it("taux de passage depuis l'étape précédente mesurée", () => {
    expect(cle(t.entonnoir, "trouves").passage).toBeNull();
    expect(cle(t.entonnoir, "avec_numero").passage).toBe(60);
    expect(cle(t.entonnoir, "rendez_vous").passage).toBe(20);
  });
  it("source absente : valeur null, état « non mesuré », jamais 0", () => {
    const sans = tableauDirection("2026-10", { rapport: null, direction: null }, null);
    for (const e of sans.entonnoir) {
      expect(e.valeur).toBeNull();
      expect(e.etat === "non_mesure" || e.etat === "connexion_a_faire").toBe(true);
      expect(e.passage).toBeNull();
    }
    expect(cle(sans.entonnoir, "trouves").etat).toBe("non_mesure");
  });
  it("étapes mesurées par import absentes : « connexion à faire », le reste reste mesuré", () => {
    const x = tableauDirection("2026-10", { rapport: rapportFictif(), direction: directionFictive({ etapes: { contactes: null, rendezVous: null, clientsGagnes: null } }) }, null);
    expect(cle(x.entonnoir, "contactes")).toMatchObject({ valeur: null, etat: "connexion_a_faire" });
    expect(cle(x.entonnoir, "fiables").valeur).toBe(20);
    expect(cle(x.entonnoir, "rendez_vous").passage).toBeNull();
  });
  it("une valeur 0 reste un 0 mesuré (≠ non mesuré)", () => {
    const x = tableauDirection("2026-10", { rapport: rapportFictif({ trouves: 0, qualifies: 0 }), direction: directionFictive({ prospects: { trouves: 0, avecNumero: 0 } }) }, null);
    expect(cle(x.entonnoir, "trouves")).toMatchObject({ valeur: 0, etat: "mesure" });
    expect(cle(x.entonnoir, "avec_numero").passage).toBeNull();
  });
});

describe("comparaison avec le mois précédent", () => {
  it("variation par indicateur ; précédent illisible : pas de variation", () => {
    const prec = { rapport: rapportFictif({ trouves: 80, qualifies: 10, mois: "2026-09" }), direction: directionFictive({ prospects: { trouves: 80, avecNumero: 40 } }) };
    const t = tableauDirection("2026-10", { rapport: rapportFictif(), direction: directionFictive() }, prec);
    expect(cle(t.entonnoir, "trouves").variation).toMatchObject({ precedent: 80, ecart: 20, sens: "hausse" });
    expect(cle(t.entonnoir, "fiables").variation?.pourcent).toBe(100);
    const sans = tableauDirection("2026-10", { rapport: rapportFictif(), direction: directionFictive() }, { rapport: null, direction: null });
    expect(cle(sans.entonnoir, "trouves").variation).toBeNull();
    expect(t.moisPrecedent).toBe("2026-09");
  });
});

describe("coût de l'IA", () => {
  it("total, jetons, par agent (regroupé par nom, plus coûteux d'abord) et par mission", () => {
    const rapport = rapportFictif({ couts: [coutFictif("Contenus", 500), coutFictif("Contenus", 250, 10, 5), coutFictif("Veille", 900, 100, 0)] });
    const t = tableauDirection("2026-10", { rapport, direction: directionFictive() }, null);
    expect(t.couts.total).toMatchObject({ valeur: 1650, etat: "mesure" });
    expect(t.couts.parAgent.map((a) => [a.agent, a.coutCentimes])).toEqual([["Veille", 900], ["Contenus", 750]]);
    expect(t.couts.jetons.valeur).toBe(1200 + 15 + 100);
    expect(t.couts.parMission).toEqual([{ libelle: "MKT-1 Campagne d'automne", coutCentimes: 1500, jetons: 9000 }]);
    expect(t.couts.sansMissionCentimes).toBe(300);
  });
  it("coût par prospect qualifié = coût total / qualifiés", () => {
    const rapport = rapportFictif({ qualifies: 20, couts: [coutFictif("A", 1000)] });
    expect(tableauDirection("2026-10", { rapport, direction: null }, null).couts.parProspectQualifie.valeur).toBe(50);
  });
  it("aucun qualifié : non mesuré, pas de division par zéro", () => {
    const rapport = rapportFictif({ qualifies: 0, couts: [coutFictif("A", 1000)] });
    const i = tableauDirection("2026-10", { rapport, direction: null }, null).couts.parProspectQualifie;
    expect(i.valeur).toBeNull();
    expect(i.note).toMatch(/Aucun prospect qualifié/u);
  });
  it("abonnement (coût en euros nul) : total 0 € expliqué, coût par qualifié non mesuré", () => {
    const rapport = rapportFictif({ couts: [coutFictif("A", 0)] });
    const t = tableauDirection("2026-10", { rapport, direction: null }, null);
    expect(t.couts.total).toMatchObject({ valeur: 0, etat: "mesure" });
    expect(t.couts.total.note).toMatch(/abonnement/u);
    expect(t.couts.parProspectQualifie).toMatchObject({ valeur: null, etat: "non_mesure" });
  });
  it("aucune ligne de coût, ou rapport illisible : tout est non mesuré", () => {
    for (const rapport of [rapportFictif({ couts: [] }), null]) {
      const t = tableauDirection("2026-10", { rapport, direction: null }, null);
      expect(t.couts.total.valeur).toBeNull();
      expect(t.couts.jetons.valeur).toBeNull();
      expect(t.couts.parProspectQualifie.valeur).toBeNull();
      expect(t.couts.parAgent).toEqual([]);
      expect(t.couts.sansMissionCentimes).toBeNull();
    }
  });
});

describe("missions", () => {
  const d = directionFictive();
  it("en cours, terminées, durée moyenne d'une mission terminée", () => {
    const t = tableauDirection("2026-10", { rapport: null, direction: d }, null);
    expect(t.missions.enCours.valeur).toBe(1);
    expect(t.missions.terminees.valeur).toBe(1);
    expect(t.missions.dureeMoyenne.valeur).toBe(240);
  });
  it("délai moyen par phase (module avancement-missions) : seules les phases terminées comptent", () => {
    const phases = delaisParPhase(d.missions!);
    expect(phases.find((p) => p.id === "strategie")).toMatchObject({ heures: 24, effectif: 1 });
    expect(phases.find((p) => p.id === "production")).toMatchObject({ heures: 72, effectif: 1 });
    expect(phases.find((p) => p.id === "revue")).toMatchObject({ heures: null, effectif: 0 });
    expect(phases.map((p) => p.id)).not.toContain("reponse");
  });
  it("source illisible : non mesuré, pas de phases mesurées", () => {
    const t = tableauDirection("2026-10", { rapport: null, direction: directionFictive({ missions: null }) }, null);
    expect(t.missions.enCours).toMatchObject({ valeur: null, etat: "non_mesure" });
    expect(t.missions.phasesMesurees).toBe(false);
  });
  it("mission terminée avant le mois : ignorée ; sans mission terminée, durée non mesurée", () => {
    const d2 = directionFictive({ missions: { lignes: [{ id: "x", identifiant: null, titre: "Ancienne", statut: "done", creeLe: "2026-08-01T00:00:00.000Z", termineLe: "2026-09-02T00:00:00.000Z" }], taches: [], plafond: 80 } });
    const t = tableauDirection("2026-10", { rapport: null, direction: d2 }, null);
    expect(t.missions.terminees.valeur).toBe(0);
    expect(t.missions.dureeMoyenne.valeur).toBeNull();
    expect(t.sources.map((s) => s.cle)).not.toContain("duree_mission");
  });
  it("plafond atteint : nombre minimum signalé", () => {
    const lignes = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, identifiant: null, titre: "t", statut: "todo", creeLe: "2026-10-02T00:00:00.000Z", termineLe: null }));
    const t = tableauDirection("2026-10", { rapport: null, direction: directionFictive({ missions: { lignes, taches: [], plafond: 80 } }) }, null);
    expect(t.missions.tronque).toBe(true);
    expect(t.missions.enCours.note).toMatch(/minimum/u);
  });
});

describe("décisions humaines", () => {
  it("en attente (rapport), délai moyen et médian (décisions du mois)", () => {
    const t = tableauDirection("2026-10", { rapport: rapportFictif({ attente: 3 }), direction: directionFictive() }, null);
    expect(t.decisions.enAttente.valeur).toBe(3);
    expect(t.decisions.delaiMoyen.valeur).toBeCloseTo(12);
    expect(t.decisions.delaiMedian.valeur).toBe(4);
  });
  it("0 en attente reste mesuré ; aucune décision ce mois : délais non mesurés", () => {
    const t = tableauDirection("2026-10", { rapport: rapportFictif({ attente: 0 }), direction: directionFictive({ delaiDecision: { heures: [] } }) }, null);
    expect(t.decisions.enAttente).toMatchObject({ valeur: 0, etat: "mesure" });
    expect(t.decisions.delaiMoyen).toMatchObject({ valeur: null, etat: "non_mesure" });
    expect(t.decisions.delaiMoyen.note).toMatch(/Aucune décision/u);
  });
  it("source des délais illisible : non mesuré, avec la raison", () => {
    const t = tableauDirection("2026-10", { rapport: null, direction: directionFictive({ delaiDecision: null }) }, null);
    expect(t.decisions.delaiMoyen.note).toBe("Source illisible.");
    expect(t.decisions.enAttente.valeur).toBeNull();
  });
});

describe("contenus, captation et e-mailing", () => {
  it("contenus produits, validés, publiés lus dans le rapport", () => {
    const t = tableauDirection("2026-10", { rapport: rapportFictif(), direction: null }, null);
    expect(t.contenus.map((c) => c.valeur)).toEqual([9, 6, 4]);
    expect(tableauDirection("2026-10", { rapport: null, direction: null }, null).contenus.every((c) => c.valeur === null)).toBe(true);
  });
  it("vues, soumissions, envois absents : « connexion à faire » tant que la source répond sans donnée", () => {
    const t = tableauDirection("2026-10", { rapport: null, direction: directionFictive() }, null);
    expect(t.captation.map((c) => [c.cle, c.valeur, c.etat])).toEqual([["vues", null, "connexion_a_faire"], ["soumissions", null, "connexion_a_faire"], ["envois", null, "connexion_a_faire"]]);
  });
  it("service connecté : valeurs mesurées ; route illisible : non mesuré (pas « connexion à faire »)", () => {
    const ok = tableauDirection("2026-10", { rapport: null, direction: directionFictive({ captation: { vues: 420, soumissions: 12 }, emailing: { envois: 300 } }) }, null);
    expect(ok.captation.map((c) => c.valeur)).toEqual([420, 12, 300]);
    const ko = tableauDirection("2026-10", { rapport: null, direction: null }, null);
    expect(ko.captation.every((c) => c.etat === "non_mesure")).toBe(true);
  });
});

describe("sources à connecter", () => {
  it("liste les indicateurs absents avec la raison et ce qu'il faut connecter ; rien pour ce qui est mesuré", () => {
    const t = tableauDirection("2026-10", { rapport: rapportFictif({ couts: [coutFictif("A", 100)] }), direction: directionFictive() }, null);
    const cles = t.sources.map((s) => s.cle);
    expect(cles).toEqual(expect.arrayContaining(["vues", "soumissions", "envois"]));
    expect(cles).not.toContain("trouves");
    expect(cles).not.toContain("contactes");
    const vues = cle(t.sources, "vues");
    expect(vues.raison).toBe("Connexion à faire");
    expect(vues.aConnecter).toMatch(/Umami/u);
  });
  it("tout est mesuré : liste vide", () => {
    const d = directionFictive({ captation: { vues: 1, soumissions: 1 }, emailing: { envois: 1 } });
    const t = tableauDirection("2026-10", { rapport: rapportFictif({ couts: [coutFictif("A", 100)] }), direction: d }, null);
    expect(t.sources).toEqual([]);
  });
});
