import { describe, expect, it } from "vitest";
import { evaluerPorte, normaliserElement, type EntreesPorte } from "../src/serveur/porte.js";

const R1 = "r1";
const R2 = "r2";
const ETABS = ["Liège-Guillemins", "Herstal", "Seraing"];

function preuve(element: string, revisionId = R2) {
  return { revisionId, emplacement: `## ${element}`, element, extrait: `Établissement de ${element}` };
}

function base(): EntreesPorte {
  return {
    porte: {
      exigencesCiblees: ["REQ-001"],
      revuesRequises: [
        { role: "exigences", agentId: "ctrl" },
        { role: "metier", agentId: "metier" },
      ],
      maxCycles: 3,
    },
    exigences: [{ code: "REQ-001", obligatoire: true, elementsAttendus: ETABS, exclusionEtat: "aucune", version: 1 }],
    livrable: { revisionId: R2 },
    couvertures: [{ id: "c2", revisionId: R2, code: "REQ-001", etat: "couvert", preuves: ETABS.map((e) => preuve(e)), question: null, creeLe: "2026-10-15 10:00:01" }],
    verdicts: [
      { id: "v1", revisionId: R2, role: "exigences", relecteurId: "ctrl", verdict: "PASS", exigencesExaminees: ["REQ-001"], preuvesVerifiees: ETABS.map((e) => preuve(e)), justification: null, creeLe: "2026-10-15 10:00:02" },
      { id: "v2", revisionId: R2, role: "metier", relecteurId: "metier", verdict: "PASS", exigencesExaminees: [], preuvesVerifiees: [], justification: null, creeLe: "2026-10-15 10:00:03" },
    ],
    constats: [],
    revisionsDejaRefusees: [],
  };
}

describe("porte déterministe", () => {
  it("PASS quand tout est couvert, prouvé par élément et relu sur la révision courante", () => {
    const r = evaluerPorte(base());
    expect(r.decision).toBe("PASS");
    expect(r.motifs).toEqual([]);
    expect(r.empreinte).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("scénario B : un établissement oublié est refusé, même si le relecteur dit PASS", () => {
    const e = base();
    e.couvertures = [{ ...e.couvertures[0]!, preuves: [preuve("Liège-Guillemins"), preuve("Herstal")] }];
    e.verdicts[0] = { ...e.verdicts[0]!, preuvesVerifiees: [preuve("Liège-Guillemins"), preuve("Herstal")] };
    const r = evaluerPorte(e);
    expect(r.decision).toBe("REFUS");
    const codes = r.motifs.map((m) => `${m.code}:${m.element}`);
    expect(codes).toContain("element_attendu_sans_preuve:Seraing");
    expect(codes).toContain("exigence_non_examinee:Seraing");
  });

  it("une revue faite sur une ancienne révision ne compte pas", () => {
    const e = base();
    e.verdicts[1] = { ...e.verdicts[1]!, revisionId: R1 };
    expect(evaluerPorte(e).motifs.map((m) => m.code)).toContain("revue_sur_ancienne_version");
  });

  it("une revue requise absente ou en échec refuse le passage", () => {
    const sans = base();
    sans.verdicts = sans.verdicts.filter((v) => v.role !== "metier");
    expect(evaluerPorte(sans).motifs.map((m) => m.code)).toContain("revue_requise_absente");
    const echec = base();
    echec.verdicts.push({ ...echec.verdicts[1]!, id: "v3", verdict: "CHANGES_REQUESTED", creeLe: "2026-10-15 10:00:09" });
    expect(evaluerPorte(echec).decision).toBe("REFUS");
  });

  it("une preuve absente ou sur une autre révision refuse", () => {
    const sansPreuve = base();
    sansPreuve.couvertures = [{ ...sansPreuve.couvertures[0]!, preuves: [] }];
    expect(evaluerPorte(sansPreuve).motifs.map((m) => m.code)).toContain("preuve_absente");
    const autre = base();
    autre.couvertures = [{ ...autre.couvertures[0]!, preuves: ETABS.map((x) => preuve(x, R1)) }];
    expect(evaluerPorte(autre).motifs.map((m) => m.code)).toContain("preuve_sur_autre_revision");
  });

  it("couverture partielle ou absente d'une exigence obligatoire : refus", () => {
    const partielle = base();
    partielle.couvertures = [{ ...partielle.couvertures[0]!, etat: "partiel" }];
    expect(evaluerPorte(partielle).motifs.map((m) => m.code)).toContain("exigence_partielle");
    const absente = base();
    absente.couvertures = [];
    expect(evaluerPorte(absente).motifs.map((m) => m.code)).toContain("exigence_obligatoire_non_couverte");
  });

  it("un agent ne peut pas déclarer non applicable une exigence obligatoire ; seul l'humain l'autorise", () => {
    const na = base();
    na.couvertures = [{ ...na.couvertures[0]!, etat: "na_justifie", preuves: [] }];
    expect(evaluerPorte(na).motifs.map((m) => m.code)).toContain("exclusion_non_autorisee");
    const autorisee = base();
    autorisee.exigences = [{ ...autorisee.exigences[0]!, exclusionEtat: "autorisee" }];
    autorisee.couvertures = [];
    autorisee.verdicts[0] = { ...autorisee.verdicts[0]!, preuvesVerifiees: [], exigencesExaminees: [] };
    expect(evaluerPorte(autorisee).decision).toBe("PASS");
  });

  it("scénario D : information introuvable = blocage, jamais PASS", () => {
    const e = base();
    e.couvertures = [{ ...e.couvertures[0]!, etat: "bloque", preuves: [], question: "La certification X est-elle détenue ?" }];
    const r = evaluerPorte(e);
    expect(r.decision).toBe("BLOQUE_INFORMATION");
    expect(r.motifs.find((m) => m.code === "information_manquante")?.message).toMatch(/certification X/u);
  });

  it("un constat critique ou majeur ouvert interdit le passage", () => {
    const e = base();
    e.constats = [{ findingId: "F-MET-1", gravite: "majeure", statutResolution: "ouvert", role: "metier" }];
    expect(evaluerPorte(e).decision).toBe("REFUS");
    e.constats = [{ findingId: "F-MET-1", gravite: "mineure", statutResolution: "ouvert", role: "metier" }];
    expect(evaluerPorte(e).decision).toBe("PASS");
  });

  it("NA de revue : refusé pour le contrôle des exigences, accepté justifié pour une autre revue", () => {
    const e = base();
    e.verdicts[1] = { ...e.verdicts[1]!, verdict: "NOT_APPLICABLE_JUSTIFIED", justification: "Texte sans lien ni formulaire." };
    expect(evaluerPorte(e).decision).toBe("PASS");
    e.verdicts[0] = { ...e.verdicts[0]!, verdict: "NOT_APPLICABLE_JUSTIFIED", justification: "x" };
    expect(evaluerPorte(e).motifs.map((m) => m.code)).toContain("revue_na_non_justifiee");
  });

  it("cycles : au troisième refus sur des révisions distinctes, cycles épuisés", () => {
    const e = base();
    e.couvertures = [];
    e.revisionsDejaRefusees = ["ra", "rb"];
    const r = evaluerPorte(e);
    expect(r.decision).toBe("REFUS");
    expect(r.cyclesApres).toBe(3);
    expect(r.cyclesEpuises).toBe(true);
    e.revisionsDejaRefusees = ["ra", R2];
    expect(evaluerPorte(e).cyclesApres).toBe(2);
  });

  it("aucun livrable : refus", () => {
    const e = base();
    e.livrable = null;
    expect(evaluerPorte(e).motifs.map((m) => m.code)).toContain("livrable_absent");
  });

  it("déterminisme : mêmes entrées, même empreinte ; entrée modifiée, autre empreinte", () => {
    expect(evaluerPorte(base()).empreinte).toBe(evaluerPorte(base()).empreinte);
    const e = base();
    e.constats = [{ findingId: "F-X", gravite: "info", statutResolution: "ouvert", role: "metier" }];
    expect(evaluerPorte(e).empreinte).not.toBe(evaluerPorte(base()).empreinte);
  });

  it("normalisation des éléments (accents, casse, tirets)", () => {
    expect(normaliserElement("Liège-Guillemins")).toBe(normaliserElement("liege guillemins"));
  });
});
