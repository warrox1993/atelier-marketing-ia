/**
 * Stratégie approuvée par l'humain (décision sur la révision d'un document `strategie`) : publiée en connaissance
 * « Stratégie marketing » (type `strategie`), version N, l'ancienne passant `perime` ; un rejeu ne crée pas de doublon.
 * Stock des connaissances en mémoire (seules les opérations d'écriture de l'import y sont utiles).
 */
import { describe, expect, it } from "vitest";
import type { LigneDocument, LigneVersion, StockConnaissances } from "../src/serveur/base-connaissances.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, REV1, REV2, SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const MAINTENANT = new Date("2026-11-07T10:00:00Z");
const STRATEGIE_1 = "# Stratégie marketing\n\nObjectif : remplir les stages de mars par les écoles de Namur.\n";
const STRATEGIE_2 = "# Stratégie marketing\n\nObjectif : remplir les stages de mars et d'avril ; ajouter les écoles de Liège.\n";

function stockMemoire() {
  const t = { docs: [] as LigneDocument[], versions: [] as LigneVersion[], passages: 0 };
  const stock = {
    listerDocuments: async (c: string) => structuredClone(t.docs.filter((x) => x.companyId === c)),
    lireDocument: async (c: string, id: string) => structuredClone(t.docs.find((x) => x.companyId === c && x.id === id) ?? null),
    listerVersions: async (c: string, ids?: string[]) => structuredClone(t.versions.filter((x) => x.companyId === c && (!ids || ids.includes(x.documentId)))),
    insererDocument: async (d: LigneDocument) => void t.docs.push(structuredClone(d)),
    insererVersion: async (v: LigneVersion) => void t.versions.push(structuredClone(v)),
    majVersion: async (c: string, id: string, champs: Record<string, unknown>) => {
      const v = t.versions.find((x) => x.companyId === c && x.id === id);
      if (v) Object.assign(v, Object.fromEntries(Object.entries(champs).filter(([, x]) => x !== undefined)));
    },
    insererPassage: async () => void (t.passages += 1),
    activerVersion: async (c: string, documentId: string, id: string, n: number) => {
      for (const v of t.versions) if (v.companyId === c && v.documentId === documentId) v.active = v.id === id;
      Object.assign(t.versions.find((x) => x.id === id)!, { etatIndexation: "indexe", motifRefus: null, passages: n });
    },
    indexActif: async () => null,
  } as unknown as StockConnaissances;
  return { stock, t };
}

function banc() {
  const k = stockMemoire();
  const b = creerBanc({ mode: "reel", modeEntreprise: "reel" });
  b.tacheSousPorte({ status: "in_review", corps: STRATEGIE_1 });
  b.t.portes[0]!.cleLivrable = "strategie";
  b.documents.set(`${ISSUE}:strategie`, b.documents.get(`${ISSUE}:livrable`)!);
  b.passe();
  const services = creerServices(b.ctx, { base: b.base, connaissances: { stock: k.stock, maintenant: () => MAINTENANT } });
  /** Nouvelle révision du document `strategie`, évaluée PASS, puis décision humaine. */
  const reviser = (revision: string, corps: string) => {
    b.documents.set(`${ISSUE}:strategie`, { latestRevisionId: revision, latestRevisionNumber: 2, title: "Stratégie", body: corps });
    b.passe(revision);
  };
  const decider = (revision: string, action: "approuver" | "demander_correction" = "approuver") =>
    services.routes["tache.decision"]!({ cle: "tache.decision", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: humain, corps: { issueId: ISSUE, revisionId: revision, action, commentaire: "ok" } });
  const versions = () => k.t.versions.filter((v) => k.t.docs.find((d) => d.id === v.documentId)?.type === "strategie");
  return { b, k, reviser, decider, versions };
}

describe("stratégie approuvée : publiée en connaissance", () => {
  it("approbation : version 1 publiée (type strategie, en vigueur, active)", async () => {
    const s = banc();
    await s.decider(REV1);
    expect(s.k.t.docs).toHaveLength(1);
    expect(s.k.t.docs[0]).toMatchObject({ type: "strategie", titre: "Stratégie marketing", companyId: SOC });
    expect(s.versions()).toHaveLength(1);
    expect(s.versions()[0]).toMatchObject({ version: 1, active: true, statut: "en_vigueur", etatIndexation: "indexe" });
  });

  it("approbation suivante : version 2 sur le même document, la version 1 est périmée", async () => {
    const s = banc();
    await s.decider(REV1);
    s.reviser(REV2, STRATEGIE_2);
    await s.decider(REV2);
    expect(s.k.t.docs).toHaveLength(1);
    const v = s.versions();
    expect(v.map((x) => [x.version, x.statut, x.active])).toEqual([[1, "perime", false], [2, "en_vigueur", true]]);
  });

  it("retour à un contenu identique à une version périmée : nouvelle version publiée ; identique à la version en vigueur : rien", async () => {
    const s = banc();
    const REV3 = "88888888-8888-4888-8888-888888888883";
    await s.decider(REV1);
    s.reviser(REV2, STRATEGIE_2);
    await s.decider(REV2);
    s.reviser(REV3, STRATEGIE_1);
    await s.decider(REV3);
    expect(s.versions().map((x) => [x.version, x.statut, x.active])).toEqual([[1, "perime", false], [2, "perime", false], [3, "en_vigueur", true]]);
    await s.decider(REV3);
    expect(s.versions()).toHaveLength(3);
  });

  it("rejeu de la même décision : pas de doublon", async () => {
    const s = banc();
    await s.decider(REV1);
    await s.decider(REV1);
    expect(s.versions()).toHaveLength(1);
  });

  it("une demande de correction ne publie rien", async () => {
    const s = banc();
    await s.decider(REV1, "demander_correction");
    expect(s.k.t.docs).toHaveLength(0);
  });

  it("un autre document que la stratégie ne publie rien", async () => {
    const s = banc();
    s.b.t.portes[0]!.cleLivrable = "livrable";
    await s.decider(REV1);
    expect(s.k.t.docs).toHaveLength(0);
  });
});
