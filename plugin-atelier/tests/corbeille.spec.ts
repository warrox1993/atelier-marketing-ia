/**
 * Corbeille : mise à la corbeille réversible, restauration, purge et refus des agents.
 * Les routes sont appelées avec un faux hôte (tâches) et un stock en mémoire (documents, prospects).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE, ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, GestionnaireRoute, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { creerBase } from "../src/serveur/base.js";
import { creerStockConnaissances } from "../src/serveur/base-connaissances.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { DELAI_PURGE_JOURS, routesCorbeille, type ElementCorbeille, type StockCorbeille } from "../src/serveur/services-corbeille.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(900), agentId: id(900), userId: null, runId: "run-1" };
const T0 = new Date("2026-10-15T10:00:00.000Z");
const TACHE = id(10);
const DOC = id(20);
const PROSPECT = id(30);

function faux(o: { maintenant?: () => Date } = {}) {
  const issues = new Map<string, Ligne>([[TACHE, { id: TACHE, companyId: SOC, identifier: "DEM-10", title: "Post de printemps", status: "in_review" }]]);
  const documents = new Map<string, { titre: string; masque: string | null }>([[DOC, { titre: "Tarifs 2026", masque: null }]]);
  const prospects = new Map<string, { titre: string; masque: string | null }>([[PROSPECT, { titre: "Toitures Dupont SRL", masque: null }]]);
  let lignes: ElementCorbeille[] = [];
  const journal: Ligne[] = [];
  const purgesDocuments: Ligne[] = [];
  const miseAJour: Ligne[] = [];
  const cible = (t: "document" | "prospect") => (t === "document" ? documents : prospects);
  const stock: StockCorbeille = {
    lister: async (c) => lignes.filter((l) => l.companyId === c).map((l) => structuredClone(l)),
    lire: async (c, type, elementId) => structuredClone(lignes.find((l) => l.companyId === c && l.type === type && l.elementId === elementId) ?? null),
    inserer: async (e) => void lignes.push(structuredClone(e)),
    retirer: async (c, idLigne) => void (lignes = lignes.filter((l) => !(l.companyId === c && l.id === idLigne))),
    lireCible: async (_c, type, elementId) => {
      const x = cible(type).get(elementId);
      return x ? { titre: x.titre, masque: x.masque != null } : null;
    },
    masquer: async (_c, type, elementId, quand) => {
      const x = cible(type).get(elementId);
      if (!x) return 0;
      x.masque = quand;
      return 1;
    },
    supprimerProspect: async (_c, elementId) => (prospects.delete(elementId) ? 1 : 0),
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    issues: {
      get: async (issueId: string, companyId: string) => (issues.get(issueId)?.companyId === companyId ? issues.get(issueId) : null),
      update: async (issueId: string, patch: Ligne, _c: string, actor?: Ligne) => {
        miseAJour.push({ issueId, patch, actor });
        Object.assign(issues.get(issueId)!, patch);
        return issues.get(issueId);
      },
    },
  } as unknown as PluginContext;
  const base = { journaliser: async (e: Ligne) => void journal.push(e) } as unknown as BaseAtelier;
  // Suppression réelle d'un document : passe par la route des connaissances (simulée ici).
  const supprimerConnaissance: GestionnaireRoute = async (r) => {
    const corps = r.corps as { portee: { documentId: string }; motif: string };
    // Comme la vraie route : un document déjà supprimé est « introuvable ».
    if (!documents.has(corps.portee.documentId)) throw new ErreurAtelier("introuvable", "Document introuvable dans cette entreprise.");
    purgesDocuments.push({ documentId: corps.portee.documentId, motif: corps.motif, humain: r.acteur.type === "humain" });
    documents.delete(corps.portee.documentId);
    return { corps: {} };
  };
  const routes = routesCorbeille({ ctx, base, stock, routesConnaissances: { "connaissances.supprimer": supprimerConnaissance }, maintenant: o.maintenant ?? (() => T0) });
  const appeler = (cle: "corbeille.lister" | "corbeille.supprimer" | "corbeille.restaurer" | "corbeille.vider", r: Partial<RequeteRoute> = {}) =>
    routes[cle]!({ cle, params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null);
  return { appeler, refus, issues, documents, prospects, journal, purgesDocuments, miseAJour, lignes: () => lignes };
}

const supprimer = (type: string, idElement: string) => ({ corps: { companyId: SOC, type, id: idElement } });

describe("corbeille : routes déclarées", () => {
  it("quatre routes réservées à l'humain (auth board)", () => {
    for (const cle of ["corbeille.lister", "corbeille.supprimer", "corbeille.restaurer", "corbeille.vider"]) {
      const r = ROUTES_API.find((x) => x.cle === cle);
      expect(r, cle).toBeTruthy();
      expect(r!.auth).toBe("board");
    }
    expect(ROUTES_API.find((x) => x.cle === "corbeille.lister")).toMatchObject({ methode: "GET", chemin: "/corbeille" });
    expect(ROUTES_API.find((x) => x.cle === "corbeille.supprimer")).toMatchObject({ methode: "POST", chemin: "/corbeille/suppression" });
    expect(ROUTES_API.find((x) => x.cle === "corbeille.restaurer")).toMatchObject({ methode: "POST", chemin: "/corbeille/restauration" });
  });
});

describe("corbeille.supprimer et corbeille.lister", () => {
  it("masque un document et un prospect sans rien détruire, et les liste avec la purge à 30 jours", async () => {
    const f = faux();
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    await f.appeler("corbeille.supprimer", supprimer("prospect", PROSPECT));
    expect(f.documents.get(DOC)!.masque).toBe(T0.toISOString());
    expect(f.prospects.get(PROSPECT)!.masque).toBe(T0.toISOString());
    expect(f.purgesDocuments).toEqual([]);
    const { corps } = await f.appeler("corbeille.lister");
    const liste = corps as { delaiPurgeJours: number; elements: Array<Ligne> };
    expect(liste.delaiPurgeJours).toBe(DELAI_PURGE_JOURS);
    expect(liste.elements.map((e) => [e.type, e.titre, e.joursRestants, e.supprimePar])).toEqual(
      expect.arrayContaining([["document", "Tarifs 2026", 30, "local-board"], ["prospect", "Toitures Dupont SRL", 30, "local-board"]]),
    );
    expect(liste.elements[0]!.purgePrevueLe).toBe(new Date(T0.getTime() + 30 * 86400000).toISOString());
    expect(f.journal.map((j) => j.type)).toEqual(["corbeille.supprime", "corbeille.supprime"]);
  });

  it("annule une tâche en mémorisant son statut d'avant", async () => {
    const f = faux();
    const res = await f.appeler("corbeille.supprimer", supprimer("tache", TACHE));
    expect(res.statut).toBe(201);
    expect(f.issues.get(TACHE)!.status).toBe("cancelled");
    expect(f.miseAJour[0]).toMatchObject({ issueId: TACHE, patch: { status: "cancelled" } });
    expect(f.lignes()[0]).toMatchObject({ type: "tache", titre: "DEM-10 · Post de printemps", etatAvant: { statut: "in_review" } });
  });

  it("refuse le doublon, l'inconnu, une tâche déjà annulée, un corps étranger et une entrée invalide", async () => {
    const f = faux();
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    expect((await f.refus(f.appeler("corbeille.supprimer", supprimer("document", DOC))))?.statut).toBe(409);
    expect((await f.refus(f.appeler("corbeille.supprimer", supprimer("document", id(99)))))?.statut).toBe(404);
    expect((await f.refus(f.appeler("corbeille.supprimer", supprimer("tache", id(99)))))?.statut).toBe(404);
    f.issues.get(TACHE)!.status = "cancelled";
    expect((await f.refus(f.appeler("corbeille.supprimer", supprimer("tache", TACHE))))?.statut).toBe(409);
    expect((await f.refus(f.appeler("corbeille.supprimer", { corps: { companyId: id(77), type: "document", id: DOC } })))?.statut).toBe(404);
    expect((await f.refus(f.appeler("corbeille.supprimer", supprimer("reunion", DOC))))?.statut).toBe(400);
    expect((await f.refus(f.appeler("corbeille.supprimer", { corps: { companyId: SOC, type: "document", id: DOC, force: true } })))?.statut).toBe(400);
  });

  it("refuse les agents (403 elevation_refusee) pour les quatre routes", async () => {
    const f = faux();
    for (const cle of ["corbeille.lister", "corbeille.supprimer", "corbeille.restaurer", "corbeille.vider"] as const) {
      const e = await f.refus(f.appeler(cle, { acteur: AGENT, ...supprimer("document", DOC) }));
      expect(e?.statut, cle).toBe(403);
      expect(e?.code, cle).toBe("elevation_refusee");
    }
    expect(f.documents.get(DOC)!.masque).toBeNull();
    expect(f.lignes()).toHaveLength(0);
  });

  it("purge au passage ce dont la date est échue (30 jours), via la route des connaissances pour un document", async () => {
    let maintenant = T0;
    const f = faux({ maintenant: () => maintenant });
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    await f.appeler("corbeille.supprimer", supprimer("prospect", PROSPECT));
    maintenant = new Date(T0.getTime() + 29 * 86400000);
    expect(((await f.appeler("corbeille.lister")).corps as { elements: unknown[] }).elements).toHaveLength(2);
    maintenant = new Date(T0.getTime() + 31 * 86400000);
    const res = (await f.appeler("corbeille.lister")).corps as { elements: unknown[]; purges: number };
    expect(res).toMatchObject({ elements: [], purges: 2 });
    expect(f.documents.has(DOC)).toBe(false);
    expect(f.prospects.has(PROSPECT)).toBe(false);
    expect(f.purgesDocuments).toEqual([{ documentId: DOC, motif: "Purge de la corbeille", humain: true }]);
  });
});

describe("corbeille.restaurer", () => {
  it("remet document et prospect en place, et la tâche à son statut d'avant", async () => {
    const f = faux();
    for (const [type, cible] of [["document", DOC], ["prospect", PROSPECT], ["tache", TACHE]] as const) await f.appeler("corbeille.supprimer", supprimer(type, cible));
    for (const [type, cible] of [["document", DOC], ["prospect", PROSPECT], ["tache", TACHE]] as const) {
      const res = await f.appeler("corbeille.restaurer", supprimer(type, cible));
      expect(res.corps).toMatchObject({ restaure: { type, elementId: cible } });
    }
    expect(f.documents.get(DOC)!.masque).toBeNull();
    expect(f.prospects.get(PROSPECT)!.masque).toBeNull();
    expect(f.issues.get(TACHE)!.status).toBe("in_review");
    expect(f.lignes()).toHaveLength(0);
    expect(((await f.appeler("corbeille.lister")).corps as { elements: unknown[] }).elements).toEqual([]);
  });

  it("refuse un élément qui n'est pas à la corbeille", async () => {
    const f = faux();
    expect((await f.refus(f.appeler("corbeille.restaurer", supprimer("document", DOC))))?.statut).toBe(404);
  });
});

describe("corbeille.vider", () => {
  it("refuse sans confirmation, et ne détruit rien", async () => {
    const f = faux();
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    for (const corps of [{ companyId: SOC }, { companyId: SOC, confirmer: false }]) {
      const e = await f.refus(f.appeler("corbeille.vider", { corps }));
      expect(e?.statut).toBe(400);
      expect(e?.message).toContain("Confirmation requise");
    }
    expect(f.documents.has(DOC)).toBe(true);
    expect(f.lignes()).toHaveLength(1);
  });

  it("avec confirmation : supprime réellement documents et prospects, laisse la tâche annulée, vide la corbeille", async () => {
    const f = faux();
    for (const [type, cible] of [["document", DOC], ["prospect", PROSPECT], ["tache", TACHE]] as const) await f.appeler("corbeille.supprimer", supprimer(type, cible));
    const res = await f.appeler("corbeille.vider", { corps: { companyId: SOC, confirmer: true } });
    expect(res.corps).toMatchObject({ purges: 3, parType: { tache: 1, document: 1, prospect: 1 } });
    expect(f.documents.has(DOC)).toBe(false);
    expect(f.prospects.has(PROSPECT)).toBe(false);
    expect(f.issues.get(TACHE)!.status).toBe("cancelled");
    expect(f.lignes()).toHaveLength(0);
    expect(f.journal.filter((j) => j.type === "corbeille.purge")).toHaveLength(3);
  });
});

describe("corbeille étanche : purge d'un document déjà supprimé", () => {
  it("la purge ne bloque plus : la ligne est retirée, l'événement journalisé, lister et vider fonctionnent", async () => {
    let maintenant = T0;
    const f = faux({ maintenant: () => maintenant });
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    await f.appeler("corbeille.supprimer", supprimer("prospect", PROSPECT));
    // Le document est supprimé autrement (connaissances.supprimer) : sa ligne de corbeille reste.
    f.documents.delete(DOC);
    maintenant = new Date(T0.getTime() + 31 * 86400000);
    const res = (await f.appeler("corbeille.lister")).corps as { elements: unknown[]; purges: number };
    expect(res).toMatchObject({ elements: [], purges: 2 });
    expect(f.lignes()).toHaveLength(0);
    const purge = f.journal.find((j) => j.type === "corbeille.purge" && j.entite === "document")!;
    expect(purge.donnees).toMatchObject({ reelle: false, dejaSupprime: true });
    // Un second appel n'échoue pas non plus.
    expect(((await f.appeler("corbeille.lister")).corps as { purges: number }).purges).toBe(0);
  });

  it("corbeille.vider survit aussi à un document déjà supprimé", async () => {
    const f = faux();
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    f.documents.delete(DOC);
    const res = await f.appeler("corbeille.vider", { corps: { companyId: SOC, confirmer: true } });
    expect(res.corps).toMatchObject({ purges: 1 });
    expect(f.lignes()).toHaveLength(0);
  });

  it("une autre erreur que « introuvable » n'est pas avalée", async () => {
    const f = faux();
    await f.appeler("corbeille.supprimer", supprimer("document", DOC));
    const base = { journaliser: async () => undefined } as unknown as BaseAtelier;
    f.documents.delete(DOC);
    // Aucune route de suppression : erreur interne, la ligne reste à la corbeille.
    const routes = routesCorbeille({
      ctx: { logger: {}, issues: {} } as unknown as PluginContext, base, routesConnaissances: {},
      stock: { lister: async () => f.lignes(), lire: async () => null, inserer: async () => undefined, retirer: async () => undefined, lireCible: async () => null, masquer: async () => 0, supprimerProspect: async () => 0 },
    });
    const e = await routes["corbeille.vider"]!({ cle: "corbeille.vider", params: {}, query: {}, corps: { companyId: SOC, confirmer: true }, acteur: HUMAIN, companyId: SOC }).then(() => null, (x: unknown) => x as ErreurAtelier);
    expect(e?.code).toBe("erreur_interne");
  });
});

/* ------------------------------------------------------------------ */
/* SQL réel : filtre de corbeille et retrait de la ligne                */
/* ------------------------------------------------------------------ */

function dbEnregistreuse(lignes: Record<string, unknown>[] = []) {
  const requetes: Array<{ sql: string; params: unknown[]; ecriture: boolean }> = [];
  const db = {
    namespace: ESPACE_BASE,
    // Simule la table : une ligne marquée `corbeille_le` n'est rendue que si la requête ne filtre pas dessus.
    async query(sql: string, params: unknown[] = []) {
      requetes.push({ sql, params, ecriture: false });
      const filtre = /corbeille_le is null/u.test(sql);
      return lignes.filter((l) => !(filtre && l.corbeille_le != null));
    },
    async execute(sql: string, params: unknown[] = []) {
      requetes.push({ sql, params, ecriture: true });
      return { rowCount: 1 };
    },
  };
  return { db: db as unknown as PluginContext["db"], requetes };
}

describe("corbeille étanche : lectures en base", () => {
  const PROSPECT_LIGNE = { id: PROSPECT, company_id: SOC, cible: "entreprise", identifiant_type: "numero_bce", identifiant_valeur: "0123456749", forme: "personne_morale", mode: "demonstration", statut: "nouveau", cree_le: T0, modifie_le: T0 };

  it("lireProspect ignore un prospect à la corbeille, sauf demande explicite { corbeille: true }", async () => {
    const { db } = dbEnregistreuse([{ ...PROSPECT_LIGNE, corbeille_le: T0 }]);
    const base = creerBase(db);
    expect(await base.lireProspect(SOC, PROSPECT)).toBeNull();
    expect((await base.lireProspect(SOC, PROSPECT, { corbeille: true }))?.id).toBe(PROSPECT);
    const { db: db2 } = dbEnregistreuse([{ ...PROSPECT_LIGNE, corbeille_le: null }]);
    expect((await creerBase(db2).lireProspect(SOC, PROSPECT))?.id).toBe(PROSPECT);
  });

  it("étalonnage : issues et scores courants excluent les prospects à la corbeille ; le dédoublonnage les voit toujours", async () => {
    const { db, requetes } = dbEnregistreuse();
    const base = creerBase(db);
    await base.issuesPourEtalonnage(SOC, "entreprise", "demonstration");
    await base.scoresCourantsCible(SOC, "entreprise");
    await base.prospectsParIdentifiants(SOC, [{ type: "numero_bce", valeur: "0123.456.749" }]);
    await base.empreintesProspectsEnBase(SOC, ["a".repeat(64)]);
    const [issues, scores, ident, empr] = requetes.map((r) => r.sql);
    expect(issues).toMatch(/p\.corbeille_le is null/u);
    expect(scores).toMatch(/p\.corbeille_le is null/u);
    // Dédoublonnage : doit continuer à voir un prospect à la corbeille (sinon doublon à l'import ou à la restauration).
    expect(ident).not.toMatch(/corbeille_le/u);
    expect(empr).not.toMatch(/corbeille_le/u);
  });

  it("lireDocument ignore un document à la corbeille, sauf demande explicite { corbeille: true }", async () => {
    const doc = { id: DOC, company_id: SOC, titre: "Tarifs", type: "tarifs", produit: null, langue: "fr", mode: "demonstration", cree_par: "x", cree_le: T0 };
    const { db } = dbEnregistreuse([{ ...doc, corbeille_le: T0 }]);
    const stock = creerStockConnaissances(db);
    expect(await stock.lireDocument(SOC, DOC)).toBeNull();
    expect((await stock.lireDocument(SOC, DOC, { corbeille: true }))?.id).toBe(DOC);
  });

  it("supprimerDocument retire aussi la ligne de corbeille correspondante", async () => {
    const { db, requetes } = dbEnregistreuse();
    await creerStockConnaissances(db).supprimerDocument(SOC, DOC);
    const retrait = requetes.find((r) => r.ecriture && /delete from \S+\.corbeille /u.test(r.sql));
    expect(retrait).toBeDefined();
    expect(retrait!.sql).toMatch(/type = 'document'/u);
    expect(retrait!.params).toEqual([SOC, DOC]);
  });
});
