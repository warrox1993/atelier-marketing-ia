/**
 * Réglages des leads : routes humaines (critères, seuil, critères personnalisés, poids du score versionnés,
 * décisions humaines sur un critère), refus des agents, cloisonnement par entreprise.
 * Stock en mémoire (tests/outils-reglages-leads.ts) ; faux hôte minimal.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { CodeCritereQualification, CorrectionCritere, EvaluationCritere, ESPACE_BASE, ReglagesLeads, ReglagesScore, ROUTES_API, type CleRouteApi } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { REGLAGES_QUALIFICATION_DEFAUT } from "../src/serveur/qualification-prospects.js";
import { creerStockReglagesLeads, lireQualification, routesReglagesLeads } from "../src/serveur/services-reglages-leads.js";
import { SOC } from "./outils-base.js";
import { stockMemoire } from "./outils-reglages-leads.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "user-jb", runId: null };
const AUTRE_AGENT: ActeurHote = { type: "agent", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", agentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", userId: null, runId: "run-2" };
const AGENT: ActeurHote = { type: "agent", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: null, runId: "run-1" };
const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
const PARTICULIER = "22222222-2222-4222-8222-222222222222";
const T0 = new Date("2026-10-16T08:00:00.000Z");
const CLES = ["reglages-leads.lire", "reglages-leads.enregistrer", "reglages-score.lire", "reglages-score.enregistrer", "prospects.critere.corriger", "prospects.critere.retirer"] as const;

function faux() {
  const m = stockMemoire();
  const journal: Ligne[] = [];
  const prospects = new Map<string, Ligne>([
    [ENTREPRISE, { id: ENTREPRISE, companyId: SOC, cible: "entreprise" }],
    [PARTICULIER, { id: PARTICULIER, companyId: SOC, cible: "particulier" }],
  ]);
  const base = {
    journaliser: async (e: Ligne) => void journal.push(e),
    lireProspect: async (c: string, id: string) => (prospects.get(id)?.companyId === c ? structuredClone(prospects.get(id)) : null),
  } as unknown as BaseAtelier;
  // Annuaire des agents : Prospection (AGENT) existe dans les deux entreprises, Contenus (AUTRE_AGENT) dans la première ;
  // tout autre identifiant est inconnu.
  const annuaire = new Map<string, Ligne>([
    [`${SOC}:${AGENT.agentId}`, { id: AGENT.agentId, companyId: SOC, name: "Prospection", status: "idle" }],
    [`${SOC2}:${AGENT.agentId}`, { id: AGENT.agentId, companyId: SOC2, name: "Prospection", status: "idle" }],
    [`${SOC}:${AUTRE_AGENT.agentId}`, { id: AUTRE_AGENT.agentId, companyId: SOC, name: "Contenus", status: "idle" }],
  ]);
  const ctx = { agents: { get: async (id: string, companyId: string) => annuaire.get(`${companyId}:${id}`) ?? null } } as unknown as PluginContext;
  const routes = routesReglagesLeads({ ctx, base, stock: m.stock, maintenant: () => T0 });
  const appeler = (cle: (typeof CLES)[number] | "prospects.critere.evaluer", r: Partial<RequeteRoute> = {}) => routes[cle]!({ cle: cle as CleRouteApi, params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { ...m, journal, appeler, refus };
}

const criteresDefaut = () => CodeCritereQualification.options.map((code) => ({ code, actif: true, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[code].poids }));
const corpsReglages = (o: Ligne = {}) => ({ companyId: SOC, criteres: criteresDefaut(), seuil: 90, personnalises: [], ...o });
const SALON = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "Carte de visite reçue" };

describe("réglages des leads : routes déclarées", () => {
  it("six routes réservées à l'humain (auth board), chemins et méthodes de l'hôte (pas de PUT)", () => {
    const attendu: Record<string, [string, string]> = {
      "reglages-leads.lire": ["GET", "/reglages/leads"],
      "reglages-leads.enregistrer": ["PATCH", "/reglages/leads"],
      "reglages-score.lire": ["GET", "/reglages/score"],
      "reglages-score.enregistrer": ["PATCH", "/reglages/score"],
      "prospects.critere.corriger": ["PATCH", "/prospects/:prospectId/criteres/:code"],
      "prospects.critere.retirer": ["DELETE", "/prospects/:prospectId/criteres/:code"],
    };
    for (const [cle, [methode, chemin]] of Object.entries(attendu)) {
      expect(ROUTES_API.find((r) => r.cle === cle), cle).toMatchObject({ methode, chemin, auth: "board" });
    }
  });

  it("un agent reçoit 403 sur chacune des six routes, et rien n'est écrit", async () => {
    const f = faux();
    for (const cle of CLES) {
      const e = await f.refus(f.appeler(cle, { acteur: AGENT, params: { prospectId: ENTREPRISE, code: "taille_connue" }, corps: corpsReglages() }));
      expect(e?.code, cle).toBe("elevation_refusee");
      expect(e?.statut, cle).toBe(403);
    }
    expect(f.reglages).toHaveLength(0);
    expect(f.poids).toHaveLength(0);
    expect(f.corrections()).toHaveLength(0);
    expect(f.journal).toHaveLength(0);
  });
});

describe("reglages-leads", () => {
  it("lecture sans réglage : version 0, dix-huit critères actifs aux poids par défaut, seuil 90", async () => {
    const f = faux();
    const r = ReglagesLeads.parse((await f.appeler("reglages-leads.lire")).corps);
    expect(r).toMatchObject({ companyId: SOC, version: 0, seuil: 90, personnalises: [], decidePar: null });
    expect(Object.fromEntries(r.criteres.map((c) => [c.code, [c.actif, c.poids]]))).toEqual({
      entreprise_active: [true, 20], segment_cible: [true, 20], zone_cible: [true, 15], taille_connue: [true, 10],
      joignable_legalement: [true, 15], pas_deja_client: [true, 10], sources_concordantes: [true, 10],
      assurance_obligatoire_metier: [true, 10], installation_recente: [true, 8], evenement_recent: [true, 8], besoin_offre_active: [true, 10], pas_concurrent: [true, 0],
      emploie_personnel: [true, 6], flotte_probable: [true, 4], proprietaire_locaux: [true, 4], sante_financiere: [true, 6],
      bureau_specialise_proche: [true, 6], contact_public_permis: [true, 6],
    });
    expect(r.criteres.every((c) => c.libelle.length > 0)).toBe(true);
  });

  it("chaque enregistrement ajoute une version (jamais d'écrasement), journalisée ; la lecture rend la dernière", async () => {
    const f = faux();
    const criteres = criteresDefaut().map((c) => (c.code === "taille_connue" ? { ...c, actif: false } : c));
    const v1 = ReglagesLeads.parse((await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ criteres, seuil: 80, personnalises: [SALON] }) })).corps);
    expect(v1).toMatchObject({ version: 1, seuil: 80, personnalises: [SALON], decidePar: "user-jb", decideLe: T0.toISOString() });
    expect(v1.criteres.find((c) => c.code === "taille_connue")?.actif).toBe(false);
    const v2 = ReglagesLeads.parse((await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ seuil: 95 }) })).corps);
    expect(v2).toMatchObject({ version: 2, seuil: 95, personnalises: [] });
    expect(f.reglages.map((x) => [x.version, x.seuil])).toEqual([[1, 80], [2, 95]]);
    expect(f.journal.map((j) => [j.type, j.donnees.version])).toEqual([["reglages.leads", 1], ["reglages.leads", 2]]);
    expect(ReglagesLeads.parse((await f.appeler("reglages-leads.lire")).corps).version).toBe(2);
  });

  it("refus : seuil hors 50..100, poids hors 0..100, onze critères personnalisés, code d'un critère existant, aucun critère actif", async () => {
    const f = faux();
    const perso = (n: number) => Array.from({ length: n }, (_, i) => ({ ...SALON, code: `perso_${i}` }));
    const cas: Ligne[] = [
      corpsReglages({ seuil: 49 }),
      corpsReglages({ seuil: 101 }),
      corpsReglages({ criteres: criteresDefaut().map((c, i) => (i === 0 ? { ...c, poids: 101 } : c)) }),
      corpsReglages({ criteres: criteresDefaut().slice(1) }),
      corpsReglages({ personnalises: perso(11) }),
      corpsReglages({ personnalises: [{ ...SALON, code: "zone_cible" }] }),
      corpsReglages({ personnalises: [SALON, SALON] }),
      corpsReglages({ criteres: criteresDefaut().map((c) => ({ ...c, actif: c.code === "taille_connue" })) }),
    ];
    for (const corps of cas) expect((await f.refus(f.appeler("reglages-leads.enregistrer", { corps })))?.code, JSON.stringify(corps).slice(0, 120)).toBe("entree_invalide");
    expect((await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ personnalises: perso(10) }) })).corps).toMatchObject({ version: 1 });
  });

  it("entreprise de la route seulement : un corps qui en désigne une autre est refusé ; une autre entreprise ne voit jamais ces réglages", async () => {
    const f = faux();
    expect((await f.refus(f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ companyId: SOC2 }) })))?.code).toBe("hors_entreprise");
    await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ seuil: 70 }) });
    expect(ReglagesLeads.parse((await f.appeler("reglages-leads.lire", { companyId: SOC2 })).corps)).toMatchObject({ companyId: SOC2, version: 0, seuil: 90 });
    expect((await lireQualification(f.stock, SOC2)).reglages).toEqual(REGLAGES_QUALIFICATION_DEFAUT);
    expect((await lireQualification(f.stock, SOC)).reglages.seuil).toBe(70);
  });
});

describe("reglages-score", () => {
  it("lecture sans poids : version null et les dix critères du score ; puis versions 1 et 2 sans écrasement", async () => {
    const f = faux();
    const vide = ReglagesScore.parse((await f.appeler("reglages-score.lire")).corps);
    expect(vide).toMatchObject({ version: null, poids: {} });
    expect(vide.criteres).toHaveLength(10);
    const v1 = ReglagesScore.parse((await f.appeler("reglages-score.enregistrer", { corps: { companyId: SOC, poids: { site_present: 15, telephone_present: 0 } } })).corps);
    expect(v1).toMatchObject({ version: 1, poids: { site_present: 15, telephone_present: 0 }, decidePar: "user-jb" });
    const v2 = ReglagesScore.parse((await f.appeler("reglages-score.enregistrer", { corps: { companyId: SOC, poids: { site_present: 40 } } })).corps);
    expect(v2).toMatchObject({ version: 2, poids: { site_present: 40 } });
    expect(f.poids.map((x) => [x.version, x.poids])).toEqual([[1, { site_present: 15, telephone_present: 0 }], [2, { site_present: 40 }]]);
    expect(f.journal.map((j) => j.type)).toEqual(["reglages.score", "reglages.score"]);
  });

  it("refus : poids hors 0..100, critère inconnu, aucun poids, autre entreprise ; une autre entreprise ne voit jamais ces poids", async () => {
    const f = faux();
    for (const poids of [{ site_present: 101 }, { site_present: -5 }, { inconnu: 10 }, {}]) {
      expect((await f.refus(f.appeler("reglages-score.enregistrer", { corps: { companyId: SOC, poids } })))?.code, JSON.stringify(poids)).toBe("entree_invalide");
    }
    expect((await f.refus(f.appeler("reglages-score.enregistrer", { corps: { companyId: SOC2, poids: { site_present: 1 } } })))?.code).toBe("hors_entreprise");
    await f.appeler("reglages-score.enregistrer", { corps: { companyId: SOC, poids: { site_present: 30 } } });
    expect(ReglagesScore.parse((await f.appeler("reglages-score.lire", { companyId: SOC2 })).corps)).toMatchObject({ companyId: SOC2, version: null, poids: {} });
  });
});

describe("décision humaine sur un critère d'un lead", () => {
  const corriger = (f: ReturnType<typeof faux>, prospectId: string, code: string, corps: Ligne = {}, o: Partial<RequeteRoute> = {}) =>
    f.appeler("prospects.critere.corriger", { params: { prospectId, code }, corps: { companyId: SOC, statut: "verifie", justification: "Appel du gérant", ...corps }, ...o });

  it("enregistre la décision (auteur, date), la remplace, la retire ; chaque geste est journalisé", async () => {
    const f = faux();
    const c = CorrectionCritere.parse((await corriger(f, ENTREPRISE, "taille_connue")).corps);
    expect(c).toEqual({ prospectId: ENTREPRISE, code: "taille_connue", statut: "verifie", justification: "Appel du gérant", auteur: "user-jb", date: T0.toISOString() });
    await corriger(f, ENTREPRISE, "taille_connue", { statut: "contraire", justification: "Effectif réel : 300" });
    expect(f.corrections()).toHaveLength(1);
    expect(f.corrections()[0]).toMatchObject({ statut: "contraire", justification: "Effectif réel : 300" });
    const lu = await lireQualification(f.stock, SOC);
    expect(lu.corrections.get(ENTREPRISE)).toEqual([{ code: "taille_connue", statut: "contraire", justification: "Effectif réel : 300", auteur: "user-jb", date: T0.toISOString() }]);
    expect((await f.appeler("prospects.critere.retirer", { params: { prospectId: ENTREPRISE, code: "taille_connue" } })).corps).toEqual({ prospectId: ENTREPRISE, code: "taille_connue", retire: true });
    expect(f.corrections()).toHaveLength(0);
    expect((await f.refus(f.appeler("prospects.critere.retirer", { params: { prospectId: ENTREPRISE, code: "taille_connue" } })))?.code).toBe("introuvable");
    expect(f.journal.map((j) => [j.type, j.entiteId, j.donnees.code])).toEqual([
      ["prospects.critere.corrige", ENTREPRISE, "taille_connue"],
      ["prospects.critere.corrige", ENTREPRISE, "taille_connue"],
      ["prospects.critere.retire", ENTREPRISE, "taille_connue"],
    ]);
    // La justification (texte libre) ne part pas au journal.
    expect(JSON.stringify(f.journal)).not.toContain("Effectif réel");
  });

  it("critère personnalisé : accepté s'il figure dans les réglages, inconnu sinon", async () => {
    const f = faux();
    expect((await f.refus(corriger(f, ENTREPRISE, "rencontre_salon")))?.code).toBe("introuvable");
    await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ personnalises: [SALON] }) });
    expect(CorrectionCritere.parse((await corriger(f, PARTICULIER, "rencontre_salon")).corps)).toMatchObject({ code: "rencontre_salon", statut: "verifie" });
  });

  it("refus : justification de moins de 3 ou plus de 500 caractères, statut inconnu, taille d'un particulier, critère désactivé, code mal formé", async () => {
    const f = faux();
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible", { justification: "ok" })))?.code).toBe("entree_invalide");
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible", { justification: "x".repeat(501) })))?.code).toBe("entree_invalide");
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible", { statut: "peut_etre" })))?.code).toBe("entree_invalide");
    expect((await f.refus(corriger(f, PARTICULIER, "taille_connue")))?.code).toBe("entree_invalide");
    expect((await f.refus(corriger(f, ENTREPRISE, "Zone-Cible")))?.code).toBe("entree_invalide");
    await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ criteres: criteresDefaut().map((c) => (c.code === "zone_cible" ? { ...c, actif: false } : c)) }) });
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible")))?.code).toBe("entree_invalide");
    expect(f.corrections()).toHaveLength(0);
  });

  it("entreprise de la route seulement : le prospect d'une autre entreprise est introuvable, un corps d'une autre entreprise est refusé", async () => {
    const f = faux();
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible", { companyId: SOC2 }, { companyId: SOC2 })))?.code).toBe("introuvable");
    expect((await f.refus(corriger(f, ENTREPRISE, "zone_cible", { companyId: SOC2 })))?.code).toBe("hors_entreprise");
    await corriger(f, ENTREPRISE, "zone_cible");
    expect((await lireQualification(f.stock, SOC2)).corrections.size).toBe(0);
    expect((await f.refus(f.appeler("prospects.critere.retirer", { params: { prospectId: ENTREPRISE, code: "zone_cible" }, companyId: SOC2 })))?.code).toBe("introuvable");
    expect(f.corrections()).toHaveLength(1);
  });
});

describe("évaluation d'un critère personnalisé par l'agent", () => {
  const SRC = "https://www.salon-toiture.example/exposants/dupont";
  const evaluer = (f: ReturnType<typeof faux>, prospectId: string, code: string, corps: Ligne = {}, o: Partial<RequeteRoute> = {}) =>
    f.appeler("prospects.critere.evaluer", { params: { prospectId, code }, corps: { companyId: SOC, statut: "verifie", justification: "Exposant du salon 2026", sources: [SRC], ...corps }, acteur: AGENT, ...o });
  const avecSalon = async (f: ReturnType<typeof faux>) => void (await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ personnalises: [SALON] }) }));

  it("route déclarée : POST, réservée à un agent", () => {
    expect(ROUTES_API.find((r) => r.cle === "prospects.critere.evaluer")).toMatchObject({ methode: "POST", chemin: "/prospects/:prospectId/criteres/:code/evaluation", auth: "agent" });
  });

  it("l'agent évalue un critère personnalisé : enregistré, remplacé, lu pour le calcul, journalisé sans la justification", async () => {
    const f = faux();
    await avecSalon(f);
    const e = EvaluationCritere.parse((await evaluer(f, ENTREPRISE, "rencontre_salon")).corps);
    expect(e).toEqual({ prospectId: ENTREPRISE, code: "rencontre_salon", statut: "verifie", justification: "Exposant du salon 2026", sources: [SRC], agent: AGENT.id, date: T0.toISOString() });
    await evaluer(f, ENTREPRISE, "rencontre_salon", { statut: "contraire", justification: "Liste d'exposants 2026 sans ce nom", sources: ["connaissance://fiche/salon"] });
    expect(f.evaluations()).toHaveLength(1);
    expect(f.evaluations()[0]).toMatchObject({ statut: "contraire", sources: ["connaissance://fiche/salon"] });
    const lu = await lireQualification(f.stock, SOC);
    expect(lu.evaluations.get(ENTREPRISE)).toEqual([{ code: "rencontre_salon", statut: "contraire", justification: "Liste d'exposants 2026 sans ce nom", sources: ["connaissance://fiche/salon"], agent: AGENT.id, date: T0.toISOString() }]);
    expect(f.journal.filter((j) => j.type === "prospects.critere.evalue").map((j) => j.donnees)).toEqual([
      { code: "rencontre_salon", statut: "verifie", sources: 1 },
      { code: "rencontre_salon", statut: "contraire", sources: 1 },
    ]);
    expect(JSON.stringify(f.journal)).not.toContain("Liste d'exposants");
    expect(JSON.stringify(f.journal)).not.toContain("salon-toiture");
    // Une évaluation n'écrit jamais dans les décisions humaines.
    expect(f.corrections()).toHaveLength(0);
  });

  it("« non vérifié » sans source est accepté ; « vérifié » ou « contraire » sans source est refusé", async () => {
    const f = faux();
    await avecSalon(f);
    expect((await evaluer(f, ENTREPRISE, "rencontre_salon", { statut: "non_verifie", sources: [], justification: "Aucune source ne permet de trancher" })).corps).toMatchObject({ statut: "non_verifie", sources: [] });
    for (const statut of ["verifie", "contraire"]) expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", { statut, sources: [] })))?.code, statut).toBe("entree_invalide");
    // Source qui n'est ni une URL ni une adresse connaissance://, justification trop courte.
    expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", { sources: ["je crois"] })))?.code).toBe("entree_invalide");
    expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", { justification: "ok" })))?.code).toBe("entree_invalide");
    expect(f.evaluations()).toHaveLength(1);
  });

  it("seul l'agent Prospection évalue : un autre agent, un agent inconnu ou terminé reçoivent 403 elevation_refusee", async () => {
    const f = faux();
    await avecSalon(f);
    const inconnu: ActeurHote = { ...AUTRE_AGENT, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", agentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
    for (const acteur of [AUTRE_AGENT, inconnu]) {
      const e = await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", {}, { acteur }));
      expect(e?.code).toBe("elevation_refusee");
      expect(e?.statut).toBe(403);
    }
    expect(f.evaluations()).toHaveLength(0);
    expect((await evaluer(f, ENTREPRISE, "rencontre_salon")).corps).toMatchObject({ code: "rencontre_salon" });
    expect(f.evaluations()).toHaveLength(1);
  });

  it("refus sur un critère codé (même actif), un critère inconnu et un critère personnalisé retiré des réglages", async () => {
    const f = faux();
    await avecSalon(f);
    expect((await f.refus(evaluer(f, ENTREPRISE, "zone_cible")))?.code).toBe("entree_invalide");
    expect((await f.refus(evaluer(f, ENTREPRISE, "critere_inconnu")))?.code).toBe("entree_invalide");
    await f.appeler("reglages-leads.enregistrer", { corps: corpsReglages({ personnalises: [] }) });
    expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon")))?.code).toBe("entree_invalide");
    expect(f.evaluations()).toHaveLength(0);
  });

  it("entreprise de la route seulement : prospect d'une autre entreprise introuvable, corps d'une autre entreprise refusé ; un humain reçoit 403", async () => {
    const f = faux();
    await avecSalon(f);
    expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", { companyId: SOC2 }, { companyId: SOC2 })))?.code).toBe("introuvable");
    expect((await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", { companyId: SOC2 })))?.code).toBe("hors_entreprise");
    expect((await lireQualification(f.stock, SOC2)).evaluations.size).toBe(0);
    const h = await f.refus(evaluer(f, ENTREPRISE, "rencontre_salon", {}, { acteur: HUMAIN }));
    expect([h?.code, h?.statut]).toEqual(["elevation_refusee", 403]);
    expect(f.evaluations()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* SQL réel du stock (migration 010) et règles de l'hôte               */
/* ------------------------------------------------------------------ */

/** Règles de `paperclip/server/src/services/plugin-database.ts` (validatePluginRuntimeQuery / Execute), plus la garde d'entreprise. */
function controlerSql(sql: string, params: unknown[], lecture: boolean): void {
  const normal = sql.replace(/'([^']|'')*'/gu, "''").replace(/--.*$/gmu, "").replace(/\s+/gu, " ").trim().toLowerCase();
  if (normal.includes(";")) throw new Error(`plusieurs instructions : ${sql}`);
  if (lecture) {
    if (!normal.startsWith("select ") && !normal.startsWith("with ")) throw new Error(`lecture non SELECT : ${sql}`);
    if (/\b(insert|update|delete|alter|create|drop|truncate)\b/u.test(normal)) throw new Error(`mot de mutation dans une lecture : ${sql}`);
  } else {
    if (!/^(insert\s+into|update|delete\s+from)\b/u.test(normal)) throw new Error(`écriture non INSERT/UPDATE/DELETE : ${sql}`);
    if (/\b(alter|create|drop|truncate)\b/u.test(normal)) throw new Error(`DDL dans une écriture : ${sql}`);
  }
  if (!/\bcompany_id = \$1\b/u.test(normal) && !normal.startsWith("insert")) throw new Error(`sans garde company_id = $1 : ${sql}`);
  for (const m of normal.matchAll(/\b(?:from|join|references|into|update)\s+"?([a-z_][a-z0-9_]*)"?\."?[a-z_]/gu)) {
    if (m[1] !== ESPACE_BASE) throw new Error(`schéma étranger ${m[1]} : ${sql}`);
  }
  for (const p of params) if (Array.isArray(p)) throw new Error(`paramètre tableau JS interdit : ${sql}`);
  const vus = new Set([...sql.matchAll(/\$(\d+)/gu)].map((m) => Number(m[1])));
  for (const n of vus) if (n < 1 || n > params.length) throw new Error(`$${n} sans paramètre : ${sql}`);
  if (vus.size !== params.length) throw new Error(`paramètre non référencé : ${sql}`);
}

describe("SQL des réglages des leads (stock réel, règles de l'hôte)", () => {
  it("toutes les requêtes passent les règles (une instruction, aucun mot de mutation en lecture, garde d'entreprise, $n tous liés)", async () => {
    const vues: string[] = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, true);
        vues.push(sql);
        return [];
      },
      async execute(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, false);
        vues.push(sql);
        return { rowCount: 1 };
      },
    };
    const s = creerStockReglagesLeads(db as unknown as PluginContext["db"]);
    await s.reglagesCourants(SOC);
    await s.insererReglages(SOC, { version: 1, criteres: criteresDefaut(), seuil: 90, personnalises: [SALON], decidePar: "h", decideLe: T0.toISOString() });
    await s.poidsCourants(SOC);
    await s.insererPoids(SOC, { version: 1, poids: { site_present: 10 }, decidePar: "h", decideLe: T0.toISOString() });
    await s.corrections(SOC);
    await s.ecrireCorrection(SOC, { prospectId: ENTREPRISE, code: "zone_cible", statut: "verifie", justification: "abc", auteur: "h", date: T0.toISOString() });
    await s.retirerCorrection(SOC, ENTREPRISE, "zone_cible");
    await s.evaluations(SOC);
    await s.ecrireEvaluation(SOC, { prospectId: ENTREPRISE, code: "rencontre_salon", statut: "verifie", justification: "abc", sources: ["https://exemple.be/a"], agent: "a", date: T0.toISOString() });
    expect(vues).toHaveLength(9);
  });
});
