/**
 * Bureau de liaison, lot L7 : `liaison.lire` (onglet « Échanges » d'une tâche) et `liaison.registre` (Direction).
 * Lecture limitée à la source et à la cible, aucune fuite vers une troisième entreprise, registre refusé hors Direction
 * et pour un agent, filtres, pagination, export CSV, requêtes SQL paramétrées. Faux hôte et lectures en mémoire.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE, ROUTES_API } from "../src/contrats/index.js";
import { FiltreRegistre, libelleStatutLiaison, nomService } from "../src/contrats/liaisons-lecture.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import type { ServiceEntreprise } from "../src/serveur/liaisons/base-liaisons.js";
import { creerLectureLiaisons, type CritereRegistre, type LectureLiaisons, type LiaisonLue } from "../src/serveur/liaisons/lecture-liaisons.js";
import { routeLire } from "../src/serveur/liaisons/lire.js";
import { celluleCsv, routeRegistre } from "../src/serveur/liaisons/registre.js";
import manifest from "../src/manifest.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MKT = id(1);
const DIR = id(2);
const JUR = id(3);
const ETRANGER = id(4); // direction d'un AUTRE client
const T_MKT = id(101); // tâche d'origine, marketing
const T_MKT2 = id(103);
const T_DIR = id(201); // tâche reçue, direction
const T_JUR = id(301);
const T_ETR = id(401);
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(11), agentId: id(11), userId: null, runId: "run-1" };

const SERVICES: ServiceEntreprise[] = [
  { companyId: MKT, clientMarqueur: "courtier", serviceSlug: "marketing", estDirection: false },
  { companyId: DIR, clientMarqueur: "courtier", serviceSlug: "direction", estDirection: true },
  { companyId: JUR, clientMarqueur: "courtier", serviceSlug: "juridique", estDirection: false },
  { companyId: ETRANGER, clientMarqueur: "autre", serviceSlug: "direction", estDirection: true },
];

const liaison = (o: Partial<LiaisonLue> = {}): LiaisonLue => ({
  id: id(900), entrepriseSource: MKT, entrepriseCible: DIR, tacheOrigine: T_MKT, tacheCible: T_DIR, serviceSource: "marketing", serviceCible: "direction",
  objet: "Rapport mensuel", question: "Pouvez-vous valider le budget ?", extraits: [{ titre: "Budget", texte: "12 000 euros" }],
  statut: "ouverte", creeLe: "2026-10-10T08:00:00.000Z", reponduLe: null, ...o,
});

function monde(liaisons: LiaisonLue[]) {
  const clientDe = (c: string) => SERVICES.find((s) => s.companyId === c)?.clientMarqueur;
  const appelsRegistre: Array<{ client: string; critere: CritereRegistre; limite: number; decalage: number }> = [];
  const lecture: LectureLiaisons = {
    // Version volontairement LARGE (aucun filtrage par entreprise) : c'est la route qui doit limiter ce qu'elle rend.
    parTache: async () => liaisons,
    registre: async (client, critere, limite, decalage) => {
      appelsRegistre.push({ client, critere, limite, decalage });
      const jour = (iso: string) => iso.slice(0, 10);
      const ok = liaisons
        .filter((l) => clientDe(l.entrepriseSource) === client)
        .filter((l) => !critere.service || l.serviceSource === critere.service || l.serviceCible === critere.service)
        .filter((l) => !critere.statut || l.statut === critere.statut)
        .filter((l) => !critere.du || jour(l.creeLe) >= critere.du)
        .filter((l) => !critere.au || jour(l.creeLe) <= critere.au)
        .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
      return { lignes: ok.slice(decalage, decalage + limite), total: ok.length };
    },
  };
  const taches: Ligne[] = [
    { id: T_MKT, companyId: MKT }, { id: T_MKT2, companyId: MKT }, { id: T_DIR, companyId: DIR }, { id: T_JUR, companyId: JUR }, { id: T_ETR, companyId: ETRANGER },
  ];
  const ctx = { issues: { get: async (i: string, c: string) => taches.find((t) => t.id === i && t.companyId === c) ?? null } } as unknown as PluginContext;
  const stock = { serviceDeEntreprise: async (c: string) => SERVICES.find((s) => s.companyId === c) ?? null };
  const routes = { ...routeLire({ ctx, lecture }), ...routeRegistre({ stock, lecture }) };
  const lire = (issueId: string, companyId: string, acteur: ActeurHote = HUMAIN) =>
    routes["liaison.lire"]!({ cle: "liaison.lire", params: { issueId }, query: {}, corps: null, acteur, companyId } satisfies RequeteRoute);
  const registre = (companyId: string, query: Record<string, string | string[]> = {}, acteur: ActeurHote = HUMAIN) =>
    routes["liaison.registre"]!({ cle: "liaison.registre", params: {}, query, corps: null, acteur, companyId } satisfies RequeteRoute);
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { lire, registre, refus, appelsRegistre };
}

describe("contrats de lecture", () => {
  it("déclare les deux routes en lecture humaine et ne touche pas aux capacités du manifeste", () => {
    expect(ROUTES_API.find((r) => r.cle === "liaison.lire")).toMatchObject({ methode: "GET", chemin: "/taches/:issueId/liaisons", auth: "board", resolution: { from: "issue", param: "issueId" } });
    expect(ROUTES_API.find((r) => r.cle === "liaison.registre")).toMatchObject({ methode: "GET", chemin: "/liaisons/registre", auth: "board", resolution: { from: "query", key: "companyId" } });
    expect((manifest.apiRoutes ?? []).map((r) => r.routeKey)).toEqual(expect.arrayContaining(["liaison.lire", "liaison.registre"]));
  });

  it("connaît le nom exact de chacun des services du registre (28), sans repli sur le slug", () => {
    const registre = JSON.parse(readFileSync(new URL("../../organisation/registre/services.json", import.meta.url), "utf8")) as { services: Array<{ slug: string; nom: string }>; flux: unknown[] };
    expect(registre.services.length).toBe(28);
    for (const x of registre.services) expect(nomService(x.slug), x.slug).toBe(x.nom);
  });

  it("donne des noms lisibles et les cinq libellés de statut", () => {
    expect(nomService("sav-sinistres")).toBe("Service après-vente et sinistres");
    expect(nomService("nouveau-service")).toBe("Nouveau service");
    expect(libelleStatutLiaison("en_attente_approbation")).toBe("En attente de votre accord");
    expect(libelleStatutLiaison("ouverte")).toBe("Transmise");
    expect(libelleStatutLiaison("repondue")).toBe("Répondue");
    expect(libelleStatutLiaison("refusee")).toBe("Refusée");
    expect(libelleStatutLiaison("annulee")).toBe("Annulée");
    expect(libelleStatutLiaison("en_attente_approbation", "registre")).toBe("En attente d'accord");
  });
});

describe("liaison.lire : isolation", () => {
  it("côté source : question, extraits, statut, dates et noms lisibles", async () => {
    const m = monde([liaison({ statut: "en_attente_approbation", tacheCible: null })]);
    const r = await m.lire(T_MKT, MKT);
    expect(r.statut).toBe(200);
    const [v] = (r.corps as Ligne).liaisons;
    expect(v).toMatchObject({
      role: "source", nomServiceSource: "Marketing", nomServiceCible: "Direction", objet: "Rapport mensuel", question: "Pouvez-vous valider le budget ?",
      extraits: [{ titre: "Budget", texte: "12 000 euros" }], statut: "en_attente_approbation", libelleStatut: "En attente de votre accord", creeLe: "2026-10-10T08:00:00.000Z",
    });
  });

  it("côté source, une liaison répondue porte la réponse et sa date", async () => {
    const m = monde([liaison({ statut: "repondue", reponse: "Budget validé.", reponduLe: "2026-10-12T09:30:00.000Z" })]);
    const [v] = ((await m.lire(T_MKT, MKT)).corps as Ligne).liaisons;
    expect(v).toMatchObject({ role: "source", libelleStatut: "Répondue", reponse: "Budget validé.", reponduLe: "2026-10-12T09:30:00.000Z" });
  });

  it("côté cible : ce qui a été transmis seulement, sans la tâche d'origine ni l'entreprise source", async () => {
    const m = monde([liaison({ reponse: "Budget validé.", statut: "repondue", reponduLe: "2026-10-12T09:30:00.000Z" })]);
    const r = await m.lire(T_DIR, DIR);
    const [v] = (r.corps as Ligne).liaisons;
    expect(v).toMatchObject({ role: "cible", nomServiceSource: "Marketing", objet: "Rapport mensuel", question: "Pouvez-vous valider le budget ?", libelleStatut: "Répondue", reponse: "Budget validé." });
    const texte = JSON.stringify(r.corps);
    expect(texte).not.toContain(T_MKT);
    expect(texte).not.toContain(MKT);
    expect(Object.keys(v).sort()).toEqual(["creeLe", "extraits", "id", "libelleStatut", "nomServiceCible", "nomServiceSource", "objet", "question", "reponduLe", "reponse", "role", "serviceCible", "serviceSource", "statut"]);
  });

  it("côté cible, une demande non transmise (attente d'accord ou refus) reste invisible", async () => {
    for (const statut of ["en_attente_approbation", "refusee"] as const) {
      const m = monde([liaison({ statut })]);
      expect(((await m.lire(T_DIR, DIR)).corps as Ligne).liaisons).toEqual([]);
    }
  });

  it("une troisième entreprise ne voit rien, même en désignant sa propre tâche", async () => {
    const m = monde([liaison()]);
    expect(((await m.lire(T_JUR, JUR)).corps as Ligne).liaisons).toEqual([]);
    expect(((await m.lire(T_ETR, ETRANGER)).corps as Ligne).liaisons).toEqual([]);
  });

  it("la tâche doit appartenir à l'entreprise résolue : sinon 404 et rien n'est lu", async () => {
    const m = monde([liaison()]);
    const e = await m.refus(m.lire(T_MKT, JUR));
    expect(e).toMatchObject({ code: "hors_entreprise" });
    expect(e!.statut).toBe(404);
  });

  it("une autre tâche de la même entreprise source ne reçoit pas la liaison", async () => {
    const m = monde([liaison()]);
    expect(((await m.lire(T_MKT2, MKT)).corps as Ligne).liaisons).toEqual([]);
  });

  it("refuse un agent (403) et un identifiant invalide (400)", async () => {
    const m = monde([liaison()]);
    const a = await m.refus(m.lire(T_MKT, MKT, AGENT));
    expect(a).toMatchObject({ code: "elevation_refusee" });
    expect(a!.statut).toBe(403);
    expect((await m.refus(m.lire("pas-un-id", MKT)))!.statut).toBe(400);
  });
});

describe("liaison.registre : accès", () => {
  const lots = [liaison()];
  it("accepte un humain dans l'entreprise Direction", async () => {
    const m = monde(lots);
    const r = await m.registre(DIR);
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ autorise: true, total: 1, page: 1, pages: 1 });
  });

  it("refuse (403) une entreprise qui n'est pas la Direction, un agent, et une entreprise non déclarée", async () => {
    const m = monde(lots);
    for (const c of [MKT, JUR]) {
      const e = await m.refus(m.registre(c));
      expect(e).toMatchObject({ code: "acces_refuse" });
      expect(e!.statut).toBe(403);
    }
    const a = await m.refus(m.registre(DIR, {}, AGENT));
    expect(a).toMatchObject({ code: "elevation_refusee" });
    expect(a!.statut).toBe(403);
    expect((await m.refus(m.registre(id(77))))!.statut).toBe(403);
    expect(m.appelsRegistre).toEqual([]);
  });

  it("ne porte que sur le client de la Direction : jamais un autre client", async () => {
    const autre = liaison({ id: id(901), entrepriseSource: ETRANGER, entrepriseCible: ETRANGER, serviceSource: "conformite", serviceCible: "direction" });
    const m = monde([...lots, autre]);
    const r = (await m.registre(DIR)).corps as Ligne;
    expect(r.lignes.map((l: Ligne) => l.id)).toEqual([id(900)]);
    expect(m.appelsRegistre[0]!.client).toBe("courtier");
    expect(((await m.registre(ETRANGER)).corps as Ligne).lignes.map((l: Ligne) => l.id)).toEqual([id(901)]);
  });

  it("ne recopie ni question, ni extraits, ni réponse", async () => {
    const m = monde([liaison({ statut: "repondue", reponse: "SECRET-REPONSE" })]);
    const texte = JSON.stringify((await m.registre(DIR)).corps);
    expect(texte).not.toContain("valider le budget");
    expect(texte).not.toContain("12 000");
    expect(texte).not.toContain("SECRET-REPONSE");
    expect(texte).toContain('"nombreExtraits":1');
  });
});

describe("liaison.registre : filtres et pagination", () => {
  const dix = Array.from({ length: 10 }, (_, i) =>
    liaison({
      id: id(1000 + i), objet: `Objet ${i}`, creeLe: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      statut: i % 2 === 0 ? "ouverte" : "repondue", entrepriseCible: i === 3 ? JUR : DIR, serviceCible: i === 3 ? "juridique" : "direction",
    }),
  );

  it("pagine, les plus récentes d'abord", async () => {
    const m = monde(dix);
    const p1 = (await m.registre(DIR, { taille: "4", page: "1" })).corps as Ligne;
    expect(p1).toMatchObject({ total: 10, pages: 3, page: 1, taille: 4 });
    expect(p1.lignes.map((l: Ligne) => l.objet)).toEqual(["Objet 9", "Objet 8", "Objet 7", "Objet 6"]);
    const p3 = (await m.registre(DIR, { taille: "4", page: "3" })).corps as Ligne;
    expect(p3.lignes.map((l: Ligne) => l.objet)).toEqual(["Objet 1", "Objet 0"]);
    expect(m.appelsRegistre[1]).toMatchObject({ limite: 4, decalage: 8 });
  });

  it("filtre par service (source ou cible), statut et période", async () => {
    const m = monde(dix);
    const parService = (await m.registre(DIR, { service: "juridique" })).corps as Ligne;
    expect(parService.lignes.map((l: Ligne) => l.objet)).toEqual(["Objet 3"]);
    const parStatut = (await m.registre(DIR, { statut: "repondue" })).corps as Ligne;
    expect(parStatut.total).toBe(5);
    const parPeriode = (await m.registre(DIR, { du: "2026-10-03", au: "2026-10-05" })).corps as Ligne;
    expect(parPeriode.lignes.map((l: Ligne) => l.objet)).toEqual(["Objet 4", "Objet 3", "Objet 2"]);
    const combine = (await m.registre(DIR, { statut: "ouverte", du: "2026-10-03", au: "2026-10-05" })).corps as Ligne;
    expect(combine.lignes.map((l: Ligne) => l.objet)).toEqual(["Objet 4", "Objet 2"]);
  });

  it("un filtre vide est ignoré et un companyId en requête n'est jamais un filtre", async () => {
    const m = monde(dix);
    const r = (await m.registre(DIR, { service: "", statut: "", companyId: ETRANGER })).corps as Ligne;
    expect(r.total).toBe(10);
    expect(m.appelsRegistre[0]!.critere).toEqual({});
  });

  it("refuse des filtres invalides (400) : statut inconnu, date mal formée, période inversée, taille hors limites", async () => {
    const m = monde(dix);
    for (const q of <Array<Record<string, string>>>[{ statut: "inconnu" }, { du: "10/10/2026" }, { du: "2026-10-09", au: "2026-10-01" }, { taille: "1000" }, { page: "0" }, { service: "X; drop" }, { extra: "1" }]) {
      const e = await m.refus(m.registre(DIR, q));
      expect(e, JSON.stringify(q)).toMatchObject({ code: "entree_invalide" });
    }
    expect(FiltreRegistre.safeParse({}).data).toMatchObject({ page: 1, taille: 25 });
  });
});

describe("liaison.registre : export CSV", () => {
  const decode = (corps: Ligne) => Buffer.from(corps.fichier.contenuBase64, "base64").toString("utf8");

  it("exporte toutes les lignes filtrées, avec BOM, séparateur point-virgule et dates de Bruxelles", async () => {
    const m = monde([liaison({ reponduLe: "2026-10-12T09:30:00.000Z", statut: "repondue" }), liaison({ id: id(902), objet: "Autre", statut: "refusee", creeLe: "2026-10-11T22:30:00.000Z" })]);
    const r = (await m.registre(DIR, { exporter: "csv", statut: "repondue" })).corps as Ligne;
    expect(r).toMatchObject({ autorise: true, lignes: 1, tronque: false });
    expect(r.fichier.nom).toMatch(/^registre-des-echanges-\d{4}-\d{2}-\d{2}\.csv$/u);
    const csv = decode(r);
    expect(csv.startsWith("﻿")).toBe(true);
    const lignes = csv.trim().split("\r\n");
    expect(lignes[0]).toBe('"Date de la demande";"Service demandeur";"Service sollicité";"Objet";"Statut";"Extraits transmis";"Date de réponse"');
    expect(lignes[1]).toBe('"2026-10-10 10:00";"Marketing";"Direction";"Rapport mensuel";"Répondue";"1";"2026-10-12 11:30"');
    expect(lignes).toHaveLength(2);
  });

  it("protège contre l'injection de formule et double les guillemets", async () => {
    expect(celluleCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celluleCsv("+1")).toBe(`"'+1"`);
    expect(celluleCsv("-2")).toBe(`"'-2"`);
    expect(celluleCsv("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(celluleCsv("Normal")).toBe('"Normal"');
    const m = monde([liaison({ objet: "=1+1" })]);
    expect(decode(((await m.registre(DIR, { exporter: "csv" })).corps as Ligne))).toContain('"\'=1+1"');
  });

  it("l'export est refusé hors Direction comme le registre", async () => {
    const m = monde([liaison()]);
    expect((await m.refus(m.registre(MKT, { exporter: "csv" })))!.statut).toBe(403);
  });
});

describe("lectures SQL : requêtes paramétrées", () => {
  it("n'insère jamais une valeur d'entrée dans le texte SQL", async () => {
    const appels: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      namespace: ESPACE_BASE,
      query: async (sql: string, params: unknown[] = []) => {
        appels.push({ sql, params });
        return sql.includes("count(*)") ? [{ n: 0 }] : [];
      },
    } as unknown as PluginContext["db"];
    const lecture = creerLectureLiaisons(db);
    const piege = "x'; drop table liaisons; --";
    await lecture.registre(piege, { service: piege, statut: "ouverte", du: "2026-10-01", au: "2026-10-31" }, 25, 50);
    await lecture.parTache(piege, piege);
    for (const a of appels) {
      expect(a.sql).not.toContain("drop table");
      expect(a.sql).not.toContain(piege);
    }
    const principale = appels[1]!;
    expect(principale.params).toEqual([piege, piege, "ouverte", "2026-10-01", "2026-10-31", 25, 50]);
    expect(principale.sql).toContain("limit $6 offset $7");
    expect(principale.sql).toContain("services_entreprises where client_marqueur = $1");
    expect(appels[2]!.params).toEqual([piege, piege]);
  });

  it("refuse un espace de base inattendu", () => {
    expect(() => creerLectureLiaisons({ namespace: "autre" } as unknown as PluginContext["db"])).toThrow(/Espace de base/u);
  });
});
