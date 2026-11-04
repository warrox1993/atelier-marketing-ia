/**
 * Audit du 29/10/2026, paquet GP8 (SPEC-E1) : une nouvelle révision du document français périme
 * les évaluations de la traduction anglaise qui s'appuie sur lui (FR-031), pour que le PASS de
 * l'ancienne base ne laisse plus approuver ni exporter la traduction.
 */
import { describe, expect, it } from "vitest";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

const FR = "00000000-0000-4000-8000-0000000000f1";
const EN = "00000000-0000-4000-8000-0000000000e1";
const AUTRE = "00000000-0000-4000-8000-0000000000e2";

function banc() {
  const b = creerBanc();
  const porte = (issueId: string, cleLivrable: string) =>
    b.t.portes.push({ issueId, companyId: SOC, campagneId: "c", cleLivrable, exigencesCiblees: [], revuesRequises: [], maxCycles: 3, cyclesConsommes: 0, actif: true, leveePar: null, motifLevee: null, creeLe: b.horloge(), modifieLe: b.horloge() });
  const pass = (issueId: string) =>
    b.t.evaluations.push({ id: `ev-${issueId}`, companyId: SOC, issueId, revisionId: `rev-${issueId}`, decision: "PASS", motifs: [], empreinte: "e", entreesJusquA: b.horloge(), cyclesEpuises: false, par: "agent:porte", perimee: false, creeLe: b.horloge() });
  b.issues.set(FR, { id: FR, companyId: SOC, status: "in_progress", parentId: null, title: "Article" });
  b.issues.set(EN, { id: EN, companyId: SOC, status: "in_progress", parentId: FR, title: "Traduction" });
  b.issues.set(AUTRE, { id: AUTRE, companyId: SOC, status: "in_progress", parentId: "00000000-0000-4000-8000-0000000000aa", title: "Autre traduction" });
  b.documents.set(`${FR}:article-1-rea-fr`, { latestRevisionId: "fr-2", latestRevisionNumber: 2, title: "Article", body: "# Article" });
  porte(FR, "article-1-rea-fr");
  porte(EN, "article-1-rea-en");
  porte(AUTRE, "article-1-rea-en");
  pass(EN);
  pass(AUTRE);
  creerServices(b.ctx, { base: b.base });
  const reviser = (issueId: string, key: string) => b.evenements.get("issue.document.updated")!({ companyId: SOC, entityId: issueId, payload: { key } });
  const perimee = (issueId: string) => b.t.evaluations.find((e) => e.issueId === issueId)!.perimee;
  return { b, reviser, perimee };
}

describe("SPEC-E1 : traduction anglaise sur une base française périmée", () => {
  it("une révision du -fr de la tâche parente périme l'évaluation du -en de la sous-tâche", async () => {
    const { reviser, perimee } = banc();
    await reviser(FR, "article-1-rea-fr");
    expect(perimee(EN)).toBe(true);
    expect(perimee(AUTRE)).toBe(false);
  });

  it("repli : le -fr écrit dans la tâche de la traduction elle-même périme aussi son évaluation", async () => {
    const { reviser, perimee } = banc();
    await reviser(AUTRE, "article-1-rea-fr");
    expect(perimee(AUTRE)).toBe(true);
    expect(perimee(EN)).toBe(false);
  });

  it("une révision du -en ou d'un autre livrable ne touche pas les autres traductions", async () => {
    const { reviser, perimee } = banc();
    await reviser(FR, "article-1-rea-en");
    await reviser(FR, "livrable");
    expect(perimee(EN)).toBe(false);
  });
});
