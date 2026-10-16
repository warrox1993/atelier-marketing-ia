/**
 * Rapport mensuel (route `rapport.mensuel`, humain seulement) : droits, validation du mois, isolation entre
 * entreprises, « non mesuré » sans donnée, totaux sur données simulées, démonstration à part, plafond du parcours.
 * Faux hôte et fausses lectures en mémoire ; courtier fictif, aucune donnée réelle.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API, RapportMensuel } from "../src/contrats/index.js";
import { PROSPECT_B2B, REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { badgeLead, facturationDe, fenetreDuMois, PAGES_MAX_RAPPORT, routesRapport, type LecturesRapport } from "../src/serveur/services-rapport.js";
import { SOC } from "./outils-base.js";
import { stockMemoire } from "./outils-reglages-leads.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "user-jb", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: null, runId: "run-1" };
const T0 = new Date("2026-11-02T08:00:00.000Z");
const DANS = "2026-10-12T10:00:00.000Z";
const AVANT = "2026-09-30T23:59:59.000Z";
const APRES = "2026-11-01T00:00:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zero = { reel: 0, demonstration: 0 };

const lead = (n: number, companyId: string, o: Ligne = {}): Ligne => {
  const { empreintes: _e, score: _s, basesLegales: _b, ...reste } = structuredClone(PROSPECT_B2B) as Ligne;
  return { ...reste, id: id(n), companyId, statut: "nouveau", creeLe: DANS, mode: "reel", ...o };
};
const campagne = (n: number, companyId: string, creeLe: string, statut: string, archive = false): Ligne => ({ id: id(100 + n), companyId, nom: `Campagne ${n}`, creeLe, etatProjet: { statut, enPause: false, archive } });

interface Options {
  prospects?: Ligne[];
  campagnes?: Ligne[];
  contenus?: Record<string, LecturesRapport["contenus"] extends (...a: never[]) => Promise<infer R> ? R : never>;
  exportes?: Record<string, { reel: number; demonstration: number }>;
  mesures?: Record<string, Awaited<ReturnType<LecturesRapport["mesures"]>>>;
  couts?: Record<string, Awaited<ReturnType<LecturesRapport["couts"]>>>;
  aFaire?: Array<{ type: string; titre: string; raison: string }>;
}

function faux(o: Options = {}) {
  const prospects = o.prospects ?? [];
  const compteurs = { liste: 0, appelsLectures: [] as string[] };
  const marque = structuredClone(REFERENTIEL_COURTIER);
  const base = {
    marques: async () => [marque],
    etatBaseClients: async () => ({ dernierImport: null, clients: 0, actifs: 0 }),
    listerCampagnes: async (companyId: string) => (o.campagnes ?? []).filter((c) => c.companyId === companyId),
    listerProspects: async (companyId: string, f: { page: number; parPage: number; avecClientsActuels?: boolean }) => {
      compteurs.liste++;
      const tous = prospects.filter((p) => p.companyId === companyId);
      return { total: tous.length, lignes: tous.slice((f.page - 1) * f.parPage, f.page * f.parPage) };
    },
    detailsProspects: async () => ({ empreintes: new Map(), scores: new Map(), bases: new Map() }),
  } as unknown as BaseAtelier;
  const lectures: LecturesRapport = {
    contenus: async (c) => (compteurs.appelsLectures.push(c), o.contenus?.[c] ?? { produits: zero, valides: zero, publies: zero }),
    exportsCrm: async (c) => ({ exportes: o.exportes?.[c] ?? zero }),
    mesures: async (c) => o.mesures?.[c] ?? [],
    couts: async (c) => o.couts?.[c] ?? [],
  };
  const ctx = { companies: { get: async (c: string) => ({ id: c, name: c === SOC ? "Cabinet fictif" : "Autre cabinet" }) } } as unknown as PluginContext;
  const memoire = stockMemoire();
  const routes = routesRapport({ ctx, base, stock: memoire.stock, lectures, elementsAFaire: async () => o.aFaire ?? [], maintenant: () => T0 });
  const appeler = (r: Partial<RequeteRoute> = {}) => routes["rapport.mensuel"]!({ cle: "rapport.mensuel", params: {}, query: { mois: "2026-10" }, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const lire = async (r: Partial<RequeteRoute> = {}) => RapportMensuel.parse((await appeler(r)).corps);
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { appeler, lire, refus, compteurs };
}

const valeur = (l: Array<{ cle: string; valeur: number | null }>, cle: string) => l.find((c) => c.cle === cle)!.valeur;

describe("rapport.mensuel : déclaration, droits, validation", () => {
  it("route GET /rapport/mensuel, entreprise lue dans la requête, réservée à la session humaine", () => {
    expect(ROUTES_API.find((r) => r.cle === "rapport.mensuel")).toMatchObject({ methode: "GET", chemin: "/rapport/mensuel", auth: "board", resolution: { from: "query", key: "companyId" } });
  });

  it("un agent reçoit 403 et rien n'est lu", async () => {
    const f = faux({ prospects: [lead(1, SOC)] });
    const e = await f.refus(f.appeler({ acteur: AGENT }));
    expect(e?.code).toBe("elevation_refusee");
    expect(e?.statut).toBe(403);
    expect(f.compteurs.liste).toBe(0);
    expect(f.compteurs.appelsLectures).toEqual([]);
  });

  it("mois absent ou mal formé : 400", async () => {
    const f = faux();
    for (const mois of [undefined, "", "2026-13", "2026-1", "octobre", "2026-10-01"]) {
      const e = await f.refus(f.appeler({ query: mois === undefined ? {} : { mois } }));
      expect(e?.code, String(mois)).toBe("entree_invalide");
      expect(e?.statut).toBe(400);
    }
  });

  it("fenêtre du mois en UTC : de minuit au dernier instant, décembre et février compris", () => {
    expect(fenetreDuMois("2026-10").periode).toEqual({ debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-31T23:59:59.999Z" });
    expect(fenetreDuMois("2026-12").finExclue).toBe("2027-01-01T00:00:00.000Z");
    expect(fenetreDuMois("2028-02").periode.fin).toBe("2028-02-29T23:59:59.999Z");
  });
});

describe("rapport.mensuel : « non mesuré » et sources", () => {
  it("sans aucune donnée : devis et conversions « non mesuré » (null, jamais 0), tout le reste à zéro mesuré", async () => {
    const r = await faux().lire();
    expect(r.resultats.chiffres).toHaveLength(1);
    expect(r.resultats.chiffres[0]).toMatchObject({ cle: "devis_conversions", valeur: null, mesure: false });
    expect(r.resultats.chiffres[0]!.note).toContain("non mesuré");
    expect(r.resultats.mesures).toEqual([]);
    expect(r.coutsIa.lignes).toEqual([]);
    expect(r.coutsIa.total).toEqual({ jetonsEntree: 0, jetonsEntreeCache: 0, jetonsSortie: 0, coutCentimes: 0 });
    expect(valeur(r.contenus, "contenus_produits_reel")).toBe(0);
    expect(r.enAttenteClient.points).toEqual([]);
  });

  it("chaque chiffre porte une source non vide et la période du mois", async () => {
    const r = await faux({ prospects: [lead(1, SOC)], campagnes: [campagne(1, SOC, DANS, "in_progress")] }).lire();
    const tous = [...r.campagnes, ...r.contenus, ...r.prospects.chiffres, ...r.prospects.badges, ...r.resultats.chiffres];
    expect(tous.length).toBeGreaterThan(10);
    for (const c of tous) {
      expect(c.source, c.cle).not.toBe("");
      expect(c.periode, c.cle).toEqual({ debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-31T23:59:59.999Z" });
    }
    expect(r.mois).toBe("2026-10");
    expect(r.entreprise).toBe("Cabinet fictif");
  });

  it("devis et conversions mesurés : chaque mesure est rendue avec sa provenance", async () => {
    const m = { indicateur: "Demandes de devis", valeur: 7, unite: "demandes", periodeDebut: "2026-10-01T00:00:00.000Z", periodeFin: "2026-10-31T00:00:00.000Z", provenance: "CRM (HubSpot)" };
    const r = await faux({ mesures: { [SOC]: [m] } }).lire();
    expect(r.resultats.chiffres).toHaveLength(1);
    expect(r.resultats.chiffres[0]).toMatchObject({ libelle: "Demandes de devis", valeur: 7, mesure: true, source: "mesures (CRM (HubSpot))" });
    expect(r.resultats.mesures).toEqual([m]);
  });
});

describe("rapport.mensuel : totaux sur données simulées", () => {
  it("campagnes : créées dans le mois, actives et terminées (créées après le mois exclues)", async () => {
    const campagnes = [
      campagne(1, SOC, DANS, "in_progress"),
      campagne(2, SOC, AVANT, "in_progress"),
      campagne(3, SOC, AVANT, "completed"),
      campagne(4, SOC, AVANT, "in_progress", true),
      campagne(5, SOC, APRES, "in_progress"),
    ];
    const r = await faux({ campagnes }).lire();
    expect(valeur(r.campagnes, "campagnes_creees")).toBe(1);
    expect(valeur(r.campagnes, "campagnes_actives")).toBe(2);
    expect(valeur(r.campagnes, "campagnes_terminees")).toBe(2);
    expect(r.campagnes.find((c) => c.cle === "campagnes_actives")!.note).toContain("jour de la consultation");
  });

  it("contenus : produits, validés, publiés en réel, la démonstration comptée à part et nommée", async () => {
    const r = await faux({ contenus: { [SOC]: { produits: { reel: 5, demonstration: 2 }, valides: { reel: 3, demonstration: 1 }, publies: { reel: 2, demonstration: 4 } } } }).lire();
    expect(valeur(r.contenus, "contenus_produits_reel")).toBe(5);
    expect(valeur(r.contenus, "contenus_valides_reel")).toBe(3);
    expect(valeur(r.contenus, "contenus_publies_reel")).toBe(2);
    const demo = r.contenus.filter((c) => c.mode === "demonstration");
    expect(demo.map((c) => [c.cle, c.valeur])).toEqual([["contenus_produits_demonstration", 2], ["contenus_valides_demonstration", 1], ["contenus_publies_demonstration", 4]]);
    for (const c of demo) expect(c.libelle).toContain("(démonstration)");
  });

  it("prospects : seuls les leads du mois comptent, par mode ; badge et exportés cohérents", async () => {
    const prospects = [
      lead(1, SOC),
      lead(2, SOC),
      lead(3, SOC, { mode: "demonstration" }),
      lead(4, SOC, { creeLe: AVANT }),
      lead(5, SOC, { creeLe: APRES }),
      lead(6, SOC, { statut: "exclu", motifsExclusion: [{ motif: "hors_zone", detail: "x", constateLe: DANS }] }),
    ];
    const r = await faux({ prospects, exportes: { [SOC]: { reel: 4, demonstration: 1 } } }).lire();
    expect(valeur(r.prospects.chiffres, "prospects_trouves_reel")).toBe(3);
    expect(valeur(r.prospects.chiffres, "prospects_trouves_demonstration")).toBe(1);
    expect(valeur(r.prospects.chiffres, "prospects_exportes_reel")).toBe(4);
    expect(valeur(r.prospects.chiffres, "prospects_exportes_demonstration")).toBe(1);
    const somme = ["prospects_qualifies", "prospects_a_verifier", "prospects_ecartes"].reduce((t, c) => t + (valeur(r.prospects.badges, c) ?? 0), 0);
    const illisibles = r.prospects.badges.find((c) => c.cle === "prospects_illisibles")?.valeur ?? 0;
    expect(somme + illisibles).toBe(4);
    expect(valeur(r.prospects.badges, "prospects_ecartes")).toBeGreaterThanOrEqual(1);
    expect(r.prospects.tronque).toBe(false);
  });

  it("parcours des leads : plafond explicite, signalé quand il est dépassé", async () => {
    const trop = Array.from({ length: PAGES_MAX_RAPPORT * 200 + 1 }, (_, i) => lead(i + 1, SOC));
    const f = faux({ prospects: trop });
    const r = await f.lire();
    expect(r.prospects.tronque).toBe(true);
    expect(r.prospects.plafond).toBe(PAGES_MAX_RAPPORT * 200);
    expect(f.compteurs.liste).toBe(PAGES_MAX_RAPPORT);
    expect(r.prospects.chiffres[0]!.note).toContain("minimums");
    expect(valeur(r.prospects.chiffres, "prospects_trouves_reel")).toBe(PAGES_MAX_RAPPORT * 200);
  });

  it("coût IA : lignes par agent et modèle, totaux exacts", async () => {
    const couts = [
      { agent: "Contenus", modele: "claude-sonnet", facturation: "abonnement", jetonsEntree: 1000, jetonsEntreeCache: 400, jetonsSortie: 200, coutCentimes: 0 },
      { agent: "Prospection", modele: "claude-sonnet", facturation: "api", jetonsEntree: 500, jetonsEntreeCache: 0, jetonsSortie: 100, coutCentimes: 42 },
    ];
    const r = await faux({ couts: { [SOC]: couts } }).lire();
    expect(r.coutsIa.lignes).toEqual(couts);
    expect(r.coutsIa.total).toEqual({ jetonsEntree: 1500, jetonsEntreeCache: 400, jetonsSortie: 300, coutCentimes: 42 });
    expect(r.coutsIa.source).toContain("cost_events");
    expect(r.coutsIa.periode.debut).toBe("2026-10-01T00:00:00.000Z");
  });

  it("points en attente côté client : la liste « À faire » sans les tâches bloquées de l'équipe", async () => {
    const r = await faux({ aFaire: [
      { type: "information_manquante", titre: "Marque non décrite", raison: "r1" },
      { type: "tache_bloquee", titre: "Tâche interne", raison: "r2" },
      { type: "contenu_a_valider", titre: "Post à valider", raison: "r3" },
    ] }).lire();
    expect(r.enAttenteClient.points.map((p) => p.titre)).toEqual(["Marque non décrite", "Post à valider"]);
  });
});

describe("rapport.mensuel : isolation entre entreprises", () => {
  it("chaque lecture reçoit l'entreprise de la requête ; rien de l'autre n'apparaît", async () => {
    const f = faux({
      prospects: [lead(1, SOC), lead(2, SOC2), lead(3, SOC2)],
      campagnes: [campagne(1, SOC, DANS, "in_progress"), campagne(2, SOC2, DANS, "in_progress"), campagne(3, SOC2, DANS, "in_progress")],
      contenus: { [SOC]: { produits: { reel: 1, demonstration: 0 }, valides: zero, publies: zero }, [SOC2]: { produits: { reel: 9, demonstration: 0 }, valides: zero, publies: zero } },
      mesures: { [SOC2]: [{ indicateur: "Devis", valeur: 99, unite: "u", periodeDebut: DANS, periodeFin: DANS, provenance: "p" }] },
      couts: { [SOC2]: [{ agent: "A", modele: "m", facturation: "api", jetonsEntree: 1, jetonsEntreeCache: 0, jetonsSortie: 1, coutCentimes: 5 }] },
    });
    const a = await f.lire();
    expect(a.companyId).toBe(SOC);
    expect(valeur(a.prospects.chiffres, "prospects_trouves_reel")).toBe(1);
    expect(valeur(a.campagnes, "campagnes_creees")).toBe(1);
    expect(valeur(a.contenus, "contenus_produits_reel")).toBe(1);
    expect(a.resultats.mesures).toEqual([]);
    expect(a.coutsIa.lignes).toEqual([]);
    const b = await f.lire({ companyId: SOC2 });
    expect(b.entreprise).toBe("Autre cabinet");
    expect(valeur(b.prospects.chiffres, "prospects_trouves_reel")).toBe(2);
    expect(valeur(b.contenus, "contenus_produits_reel")).toBe(9);
    expect(b.coutsIa.total.coutCentimes).toBe(5);
    expect(b.resultats.mesures).toHaveLength(1);
  });
});

describe("rapport.mensuel : fonctions pures", () => {
  it("facturation : abonnement, api avec ou sans coût, valeur brute sinon", () => {
    expect(facturationDe("subscription_included", 0)).toBe("abonnement");
    expect(facturationDe("metered_api", 12)).toBe("api");
    expect(facturationDe("metered_api", 0)).toBe("api_cout_nul");
    expect(facturationDe("unknown", 0)).toBe("unknown");
    expect(facturationDe("", 0)).toBe("inconnue");
  });
  it("badge : exclu ou plafonné = écarté, qualifié, sinon à vérifier", () => {
    const p = (o: Ligne) => ({ statut: "nouveau", motifsExclusion: [], ...o }) as never;
    expect(badgeLead(p({ statut: "exclu" }), true, false)).toBe("ecarte");
    expect(badgeLead(p({ statut: "refuse" }), true, false)).toBe("ecarte");
    expect(badgeLead(p({}), true, true)).toBe("ecarte");
    expect(badgeLead(p({}), true, false)).toBe("qualifie");
    expect(badgeLead(p({}), false, false)).toBe("a_verifier");
  });
});
