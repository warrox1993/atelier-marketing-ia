/**
 * Rapprochement prudent des doublons de prospects : règles pures (`rapprochement-prospects.ts`) puis route
 * `prospects.fusionner-doublons` (à blanc par défaut, humain seulement, isolée par entreprise).
 */
import { describe, expect, it } from "vitest";
import type { Prospect } from "../src/contrats/index.js";
import { fusionnerProspects, nomRapprochement, raisonDoublon, trouverPairesDoublons } from "../src/serveur/rapprochement-prospects.js";
import { egalProfond } from "../src/serveur/services-prospection.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { BRIEF, SOC, creerBanc } from "./outils-base.js";
import { avecClesDonnees, REFS_CLES } from "./outils-cles-donnees.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let n = 0;
function fiche(o: { nom?: string | null; bce?: string | null; cp?: string | null; commune?: string | null; position?: { lat: number; lon: number; precision: "exacte" | "code_postal" | "commune" }; companyId?: string; cible?: Prospect["cible"]; creeLe?: string; sources?: unknown[]; motifs?: unknown[] }): Prospect {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, companyId: o.companyId ?? SOC, cible: o.cible ?? "entreprise", numeroBce: o.bce ?? null,
    denomination: o.nom === undefined ? "Isolation Outremeuse Plus" : o.nom,
    zone: { codePostal: o.cp === undefined ? "4000" : o.cp, commune: o.commune === undefined ? null : o.commune, province: null, region: null, pays: "BE", ...(o.position ? { position: o.position } : {}) },
    coordonnees: [], empreintes: [], nace: [], sources: o.sources ?? [], motifsExclusion: o.motifs ?? [], statut: "nouveau", creeLe: o.creeLe ?? "2026-10-01T10:00:00.000Z",
  } as unknown as Prospect;
}

describe("nomRapprochement", () => {
  it("retire casse, accents, ponctuation et formes juridiques (liste explicite)", () => {
    for (const forme of ["SRL", "S.R.L.", "sprl", "SA", "S.A.", "SC", "ASBL", "BV", "NV", "VZW", "BVBA", "SCRL"]) {
      expect(nomRapprochement(`Isolation Outremeuse Plus ${forme}`), forme).toBe("isolation outremeuse plus");
    }
    expect(nomRapprochement("  ÉTABLISSEMENTS Dupré-Lambert  ")).toBe("etablissements dupre lambert");
    expect(nomRapprochement("SRL Isolation Outremeuse Plus")).toBe("isolation outremeuse plus");
  });
  it("trop court ou réduit à une forme juridique : pas de clé", () => {
    expect(nomRapprochement("SA")).toBeNull();
    expect(nomRapprochement("")).toBeNull();
    expect(nomRapprochement(null)).toBeNull();
    expect(nomRapprochement("AB SRL")).toBeNull();
  });
});

describe("raisonDoublon", () => {
  it("même numéro BCE : toujours le même prospect, même avec des noms et codes postaux différents", () => {
    expect(raisonDoublon(fiche({ bce: "0123.456.749", nom: "Toitures de Meuse", cp: "4000" }), fiche({ bce: "0123456749", nom: "Meuse Toitures SA", cp: "4020" }))).toBe("bce");
  });
  it("deux numéros BCE différents : jamais, même nom et même code postal", () => {
    expect(raisonDoublon(fiche({ bce: "0123.456.749" }), fiche({ bce: "0555.000.002" }))).toBeNull();
  });
  it("sans BCE : même nom normalisé et même code postal", () => {
    expect(raisonDoublon(fiche({}), fiche({ nom: "ISOLATION OUTREMEUSE PLUS SRL" }))).toBe("nom_code_postal");
    // Un côté avec BCE, l'autre sans : le rapprochement se fait sur le nom et le code postal.
    expect(raisonDoublon(fiche({ bce: "0123.456.749" }), fiche({ nom: "Isolation Outremeuse Plus SRL" }))).toBe("nom_code_postal");
  });
  it("faux positifs évités : autre code postal, autre commune, lieux éloignés, nom proche, nom absent, autre cible", () => {
    expect(raisonDoublon(fiche({}), fiche({ cp: "4020" }))).toBeNull();
    expect(raisonDoublon(fiche({}), fiche({ cp: null }))).toBeNull();
    expect(raisonDoublon(fiche({ commune: "Liège" }), fiche({ commune: "Herstal" }))).toBeNull();
    expect(raisonDoublon(fiche({ commune: "Liège" }), fiche({ commune: "LIEGE" }))).toBe("nom_code_postal");
    expect(raisonDoublon(fiche({ position: { lat: 50.64, lon: 5.57, precision: "exacte" } }), fiche({ position: { lat: 50.66, lon: 5.57, precision: "exacte" } }))).toBeNull();
    expect(raisonDoublon(fiche({ position: { lat: 50.64, lon: 5.57, precision: "exacte" } }), fiche({ position: { lat: 50.6401, lon: 5.5701, precision: "exacte" } }))).toBe("nom_code_postal");
    // Une position approximative ne départage pas.
    expect(raisonDoublon(fiche({ position: { lat: 50.64, lon: 5.57, precision: "code_postal" } }), fiche({ position: { lat: 50.7, lon: 5.6, precision: "exacte" } }))).toBe("nom_code_postal");
    expect(raisonDoublon(fiche({}), fiche({ nom: "Isolation Outremeuse Pro" }))).toBeNull();
    expect(raisonDoublon(fiche({ nom: null }), fiche({ nom: null }))).toBeNull();
    expect(raisonDoublon(fiche({}), fiche({ cible: "partenaire" }))).toBeNull();
  });
  it("isolation entre entreprises : jamais de rapprochement entre deux entreprises", () => {
    expect(raisonDoublon(fiche({ bce: "0123.456.749" }), fiche({ bce: "0123.456.749", companyId: SOC2 }))).toBeNull();
  });
});

describe("trouverPairesDoublons", () => {
  it("garde la fiche qui porte un BCE, sinon la plus ancienne ; A~B et B~C vont vers le même survivant", () => {
    const sansBce = fiche({ creeLe: "2026-10-01T10:00:00.000Z" });
    const avecBce = fiche({ bce: "0123.456.749", nom: "Isolation Outremeuse Plus SRL", creeLe: "2026-10-05T10:00:00.000Z" });
    const troisieme = fiche({ nom: "Isolation Outremeuse Plus SA", creeLe: "2026-10-03T10:00:00.000Z" });
    const paires = trouverPairesDoublons([sansBce, avecBce, troisieme, fiche({ nom: "Autre Entreprise", cp: "5000" })]);
    expect(paires).toHaveLength(2);
    expect(paires.every((p) => p.garde.id === avecBce.id)).toBe(true);
    expect(paires.map((p) => p.absorbe.id).sort()).toEqual([sansBce.id, troisieme.id].sort());
  });
  it("une fiche sans BCE ne relie jamais deux BCE différents", () => {
    const paires = trouverPairesDoublons([fiche({ bce: "0123.456.749" }), fiche({ bce: "0555.000.002" }), fiche({})]);
    expect(paires).toEqual([]);
  });
  it("une fiche déjà écartée comme doublon est ignorée : un second passage ne trouve rien", () => {
    const a = fiche({});
    const b = fiche({ nom: "Isolation Outremeuse Plus SRL", motifs: [{ motif: "doublon", detail: "x", constateLe: "2026-10-02T10:00:00.000Z" }] });
    expect(trouverPairesDoublons([a, b])).toEqual([]);
  });
});

describe("fusionnerProspects", () => {
  const src = (id: string, extra: Ligne = {}) => ({ type: "depot_signe", sourceId: id, service: "bce", outil: "bce_rechercher", url: null, collecteLe: "2026-10-01T10:00:00.000Z", ...extra });
  it("réunit les sources sans doublon ni perte (égalité profonde), coordonnées, NACE et empreintes", () => {
    const g = { ...fiche({}), sources: [src("s1"), src("s2", { faits: [{ a: 1 }] })], nace: [], coordonnees: [{ canal: "telephone", empreinte: "t1", valeur: "x", nature: "inconnue" }], empreintes: [{ type: "nom_code_postal", valeur: "e1" }] } as unknown as Prospect;
    const a = { ...fiche({}), sources: [src("s2", { faits: [{ a: 1 }] }), src("s3")], nace: ["43910"], coordonnees: [{ canal: "telephone", empreinte: "t1", valeur: "x", nature: "inconnue" }, { canal: "courriel", empreinte: "c1", valeur: "y", nature: "generique" }], empreintes: [{ type: "nom_code_postal", valeur: "e1" }, { type: "numero_bce", valeur: "e2" }] } as unknown as Prospect;
    const f = fusionnerProspects(g, a, egalProfond);
    expect(f.sources.map((s) => s.sourceId)).toEqual(["s1", "s2", "s3"]);
    expect(f.coordonnees.map((c) => c.empreinte)).toEqual(["t1", "c1"]);
    expect(f.nace).toEqual(["43910"]);
    expect(f.empreintes.map((e) => e.valeur)).toEqual(["e1", "e2"]);
  });
});

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

describe("prospects.fusionner-doublons", () => {
  const ARGS = { nace: ["43"], communes: ["Liège"] };
  async function banc() {
    const P = await passerelle();
    const CLES = paireEd25519();
    const signataire = new P.SignataireEnveloppe(CLES.privee);
    const b = creerBanc({ modeEntreprise: "demonstration", config: { passerelleClesPubliques: [CLES.publiqueBase64], ...REFS_CLES } });
    avecClesDonnees(b.ctx);
    const t = { prospects: [] as Ligne[], empreintes: [] as Ligne[] };
    const copie = <T>(v: T): T => structuredClone(v);
    const ext: Ligne = {
      prospectsParIdentifiants: async (c: string, ids: Array<{ type: string; valeur: string }>) => copie(t.prospects.filter((p) => p.companyId === c && ids.some((i) => i.type === p.identifiant.type && i.valeur === p.identifiant.valeur))),
      lireProspect: async (c: string, id: string) => copie(t.prospects.find((p) => p.companyId === c && p.id === id) ?? null),
      empreintesProspectsEnBase: async () => [],
      oppositionsPour: async () => [],
      clientsActuelsPour: async () => [],
      marques: async () => [],
      etatBaseClients: async () => ({ dernierImport: null, clients: 0, actifs: 0 }),
      dncmPour: async () => null,
      clientExiste: async () => false,
      clientParEmpreinte: async () => null,
      poidsScoreCourant: async () => null,
      referentielProspection: async () => ({ renvoi: null, versionMarque: null, etablissements: [] }),
      insererProspect: async (p: Ligne) => {
        const { empreintes: _e, score: _s, basesLegales: _b, ...ligne } = copie(p);
        t.prospects.push({ ...ligne, creeLe: p.creeLe ?? b.horloge(), modifieLe: p.modifieLe ?? b.horloge() });
      },
      majProspect: async (c: string, id: string, champs: Ligne) => {
        const p = t.prospects.find((x) => x.companyId === c && x.id === id);
        if (p) Object.assign(p, copie(champs));
        return p ? 1 : 0;
      },
      exclureProspect: async (c: string, id: string, motifs: unknown[]) => {
        const p = t.prospects.find((x) => x.companyId === c && x.id === id);
        if (p) Object.assign(p, { statut: "exclu", motifsExclusion: copie(motifs) });
        return p ? 1 : 0;
      },
      ajouterEmpreintesProspect: async (c: string, id: string, e: Array<{ type: string; valeur: string }>) => {
        for (const x of e) if (!t.empreintes.some((y) => y.prospectId === id && y.type === x.type && y.valeur === x.valeur)) t.empreintes.push({ companyId: c, prospectId: id, ...x });
      },
      insererScoreProspect: async () => undefined,
      detailsProspects: async (c: string, ids: string[]) => ({
        empreintes: new Map(ids.map((id) => [id, t.empreintes.filter((e) => e.companyId === c && e.prospectId === id).map((e) => ({ type: e.type, valeur: e.valeur }))])),
        scores: new Map(),
        bases: new Map(),
      }),
      listerProspects: async (c: string, f: Ligne) => {
        const toutes = t.prospects.filter((p) => p.companyId === c);
        return { total: toutes.length, lignes: copie(toutes.slice((f.page - 1) * f.parPage, f.page * f.parPage)) };
      },
    };
    const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as never;
    const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
    const appeler = (corps: Ligne, o: { companyId?: string; agent?: boolean } = {}) =>
      aiguillage.traiterRequeteApi({
        routeKey: "prospects.fusionner-doublons", method: "POST", path: "/x", params: {}, query: {}, body: { companyId: o.companyId ?? SOC, ...corps },
        actor: o.agent === false ? { actorType: "user", actorId: "local-board", userId: "local-board", runId: null } : { actorType: "agent", actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", runId: "run-1" },
        companyId: o.companyId ?? SOC, headers: {},
      } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const deposerLieu = (nom: string, companyId = SOC, id = nom) =>
      aiguillage.traiterRequeteApi({
        routeKey: "tache.prospects.deposer", method: "POST", path: "/x", params: { issueId: BRIEF }, query: {}, companyId, headers: {},
        body: {
          service: "osm", outil: "osm_commerces", arguments: ARGS,
          reponse: emballer(signataire, "demonstration", { source: "OpenStreetMap", commerces: [{ id, nom, adresse: { code_postal: "4000", commune: "Liège" } }] }, { service: "osm", outil: "osm_commerces", compte: "registre/demo-osm", args: ARGS }),
        },
        actor: { actorType: "agent", actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", runId: "run-1" },
      } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ...b, tp: t, appeler, deposerLieu };
  }

  it("à blanc par défaut : liste la paire (avec et sans SRL) et n'écrit rien", async () => {
    const f = await banc();
    await f.deposerLieu("Isolation Outremeuse Plus", SOC, "n1");
    await f.deposerLieu("Isolation Outremeuse Plus SRL", SOC, "n2");
    await f.deposerLieu("Boulangerie du Pont", SOC, "n3");
    expect(f.tp.prospects).toHaveLength(3);
    const avant = JSON.stringify(f.tp.prospects);
    const r = await f.appeler({}, { agent: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aBlanc: true, examines: 3, fusionnes: 0, paires: [{ raison: "nom_code_postal" }] });
    expect(r.body.paires).toHaveLength(1);
    expect(JSON.stringify(f.tp.prospects)).toBe(avant);
    expect(f.t.journal.map((j) => j.type)).not.toContain("prospects.doublons-fusionnes");
  });

  it("aBlanc: false fusionne : sources réunies dans la fiche gardée, absorbée écartée (doublon), rien supprimé, 2e passage vide", async () => {
    const f = await banc();
    await f.deposerLieu("Isolation Outremeuse Plus", SOC, "n1");
    await f.deposerLieu("Isolation Outremeuse Plus SRL", SOC, "n2");
    const a = f.tp.prospects[0]!;
    const b = f.tp.prospects[1]!;
    const sourcesAvant = a.sources.length + b.sources.length;
    const r = await f.appeler({ aBlanc: false }, { agent: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aBlanc: false, fusionnes: 1 });
    expect(f.tp.prospects).toHaveLength(2);
    expect(r.body.paires[0]).toMatchObject({ gardeId: a.id, absorbeId: b.id });
    expect(a.statut).not.toBe("exclu");
    expect(a.sources.length).toBe(sourcesAvant);
    expect(b.statut).toBe("exclu");
    expect(b.motifsExclusion).toEqual([expect.objectContaining({ motif: "doublon", detail: `Fusionné dans ${a.id}` })]);
    expect(f.t.journal.map((j) => j.type)).toContain("prospects.doublons-fusionnes");
    const encore = await f.appeler({ aBlanc: false }, { agent: false });
    expect(encore.body).toMatchObject({ fusionnes: 0, paires: [] });
  });

  it("réservé à un humain ; une autre entreprise n'est jamais touchée", async () => {
    const f = await banc();
    await f.deposerLieu("Isolation Outremeuse Plus", SOC, "n1");
    await f.deposerLieu("Isolation Outremeuse Plus SRL", SOC, "n2");
    expect((await f.appeler({ aBlanc: false })).status).toBe(403);
    expect(f.tp.prospects.every((p) => p.statut !== "exclu")).toBe(true);
    // Les deux fiches sont chez SOC : SOC2 n'en voit aucune et rien n'est fusionné chez SOC.
    const autre = await f.appeler({ aBlanc: false, companyId: SOC2 }, { agent: false, companyId: SOC2 });
    expect(autre.body).toMatchObject({ examines: 0, fusionnes: 0, paires: [] });
    expect(f.tp.prospects.every((p) => p.statut !== "exclu")).toBe(true);
  });
});
