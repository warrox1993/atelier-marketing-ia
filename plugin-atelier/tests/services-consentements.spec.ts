/**
 * Registre des consentements : route `consentements.registre` (humain seulement, cloisonnée par entreprise), masquage par
 * défaut, journalisation du mode complet, export CSV (échappement, injection de formule), pagination bornée.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PreuveConsentement, ROUTES_API, type ReponseExportConsentements, type ReponseRegistreConsentements } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import { chiffrer } from "../src/serveur/chiffrement-donnees.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import {
  celluleCsv, csvConsentements, lecturesConsentementsSql, masquerAdresse, masquerCourriel, masquerUrl, masquerNom, masquerTelephone, routesConsentements,
  type ConsentementLu, type CritereConsentements, type LecturesConsentements,
} from "../src/serveur/services-consentements.js";
import { SOC } from "./outils-base.js";

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "user-jb", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: null, runId: "run-1" };
const SYSTEME: ActeurHote = { type: "systeme", id: "systeme", agentId: null, userId: null, runId: null };
const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CLE = randomBytes(32);

function lu(o: Partial<ConsentementLu> & { id?: string; courriel?: string; telephone?: string; nom?: string; date?: string } = {}): ConsentementLu {
  return {
    prospectId: o.id ?? "11111111-1111-4111-8111-111111111111",
    pseudonyme: "[client-7f3a1c2b]",
    nomChiffre: chiffrer(o.nom ?? "Jeanne Dupont", CLE),
    coordonnees: [
      { canal: "courriel", valeur: chiffrer(o.courriel ?? "jeanne.dupont@exemple.be", CLE) },
      { canal: "telephone", valeur: chiffrer(o.telephone ?? "+32 475 12 34 56", CLE) },
    ],
    origine: "formulaire_entrant",
    campagneId: CAMP,
    campagne: "Toitures 2026",
    mode: "reel",
    source: { type: "formulaire", collecteLe: "2026-10-01T09:00:00.000Z", url: "https://exemple.be/devis" },
    basesLegales: [{ canal: "courriel", base: "consentement" }],
    preuve: {
      date: o.date ?? "2026-10-01T09:00:00.000Z", texteAccepte: "J'accepte de recevoir des offres de la société Exemple par courriel.", source: "https://exemple.be/devis",
      canauxAutorises: ["courriel", "telephone"], responsableNomme: "Société Exemple", reference: "soumission-42", retireLe: null,
      pageCaptation: "https://exemple.be/devis?etape=3", adresseIpTronquee: "203.0.113.0",
      ...o.preuve,
    },
    ...(o.campagne !== undefined ? { campagne: o.campagne } : {}),
  };
}

function banc(donnees: Record<string, ConsentementLu[]> = { [SOC]: [lu()] }) {
  const appels: Array<{ companyId: string; critere: CritereConsentements; limite: number; decalage: number }> = [];
  const journal: Array<Record<string, any>> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const lectures: LecturesConsentements = {
    registre: async (companyId, critere, limite, decalage) => {
      appels.push({ companyId, critere, limite, decalage });
      const toutes = donnees[companyId] ?? [];
      return { lignes: toutes.slice(decalage, decalage + limite), total: toutes.length };
    },
  };
  const routes = routesConsentements({
    lectures, cles: async () => ({ chiffrement: CLE }), journaliser: async (e) => void journal.push(e), maintenant: () => new Date("2026-10-22T08:00:00.000Z"),
  });
  const appeler = (query: Record<string, string> = {}, r: Partial<RequeteRoute> = {}) =>
    routes["consentements.registre"]!({ cle: "consentements.registre", params: {}, query: { companyId: SOC, ...query }, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  return { appeler, appels, journal };
}
const erreurDe = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as ErreurAtelier | null);
const registre = async (p: Promise<{ corps: unknown }>) => (await p).corps as ReponseRegistreConsentements;

describe("consentements.registre : déclaration et droits", () => {
  it("route GET /consentements/registre, entreprise lue dans la requête, session humaine seulement", () => {
    expect(ROUTES_API.find((r) => r.cle === "consentements.registre")).toMatchObject({
      methode: "GET", chemin: "/consentements/registre", auth: "board", resolution: { from: "query", key: "companyId" },
    });
  });
  it("un agent est refusé, avec ou sans complet=1 ou format=csv, sans aucune lecture ni journal", async () => {
    const { appeler, appels, journal } = banc();
    for (const q of [{}, { complet: "1" }, { format: "csv" }, { complet: "1", format: "csv" }] as Array<Record<string, string>>) {
      expect((await erreurDe(appeler(q, { acteur: AGENT })))?.code).toBe("elevation_refusee");
    }
    expect((await erreurDe(appeler({}, { acteur: SYSTEME })))?.code).toBe("elevation_refusee");
    expect(appels).toHaveLength(0);
    expect(journal).toHaveLength(0);
  });
});

describe("consentements.registre : cloisonnement par entreprise", () => {
  it("ne lit que l'entreprise de la requête et ignore un companyId de filtre", async () => {
    const { appeler, appels } = banc({ [SOC]: [lu({ id: "11111111-1111-4111-8111-111111111111" })], [SOC2]: [lu({ id: "22222222-2222-4222-8222-222222222222" }), lu({ id: "33333333-3333-4333-8333-333333333333" })] });
    const a = await registre(appeler());
    expect(a.total).toBe(1);
    expect(a.lignes.map((l) => l.prospectId)).toEqual(["11111111-1111-4111-8111-111111111111"]);
    // Une requête qui prétend viser l'autre entreprise par le paramètre reste servie pour l'entreprise résolue par l'hôte.
    const b = await registre(appeler({ companyId: SOC2 }));
    expect(b.lignes.map((l) => l.prospectId)).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(appels.every((x) => x.companyId === SOC)).toBe(true);
    const c = await registre(appeler({}, { companyId: SOC2 }));
    expect(c.total).toBe(2);
    expect(c.companyId).toBe(SOC2);
  });
  it("les requêtes SQL filtrent company_id en $1, n'interpolent aucune valeur et excluent corbeille et fiches à réimporter", async () => {
    const requetes: Array<{ sql: string; params: unknown[] }> = [];
    const db = { namespace: "plugin_test", query: async (sql: string, params: unknown[]) => (requetes.push({ sql, params }), [{ total: 0 }] as never[]) } as never;
    await lecturesConsentementsSql(db).registre(SOC, { du: "2026-10-01", au: "2026-10-31", campagneId: CAMP }, 25, 50);
    expect(requetes).toHaveLength(2);
    for (const r of requetes) {
      expect(r.sql).toMatch(/p\.company_id = \$1/u);
      expect(r.sql).toMatch(/p\.corbeille_le is null/u);
      expect(r.sql).toMatch(/p\.cle_a_reimporter = false/u);
      expect(r.params[0]).toBe(SOC);
      for (const valeur of [SOC, CAMP, "2026-10-01", "2026-10-31"]) expect(r.sql).not.toContain(valeur);
      expect(r.params).toEqual([SOC, "2026-10-01", "2026-10-31", CAMP]);
    }
    expect(requetes[1]!.sql).toMatch(/limit 25 offset 50/u);
  });
});

describe("consentements.registre : masquage et mode complet", () => {
  it("masque par défaut le nom, le courriel et le téléphone, sans journal", async () => {
    const { appeler, journal } = banc();
    const r = await registre(appeler());
    const l = r.lignes[0]!;
    expect(r.complet).toBe(false);
    expect(l.courriel).toBe("j•••@exemple.be");
    expect(l.telephone).toBe("+32 4•• •• •• 56");
    expect(l.nom).toBe("J••• D•••");
    expect(JSON.stringify(r)).not.toMatch(/jeanne|dupont|475|12 34/iu);
    expect(journal).toHaveLength(0);
    // La preuve elle-même est rendue : date, source, texte, page de captation, IP tronquée, campagne.
    expect(l).toMatchObject({
      consentementLe: "2026-10-01T09:00:00.000Z", source: "https://exemple.be/devis", pageCaptation: "https://exemple.be/devis?etape=3", adresseIpTronquee: "203.0.113.0",
      campagne: "Toitures 2026", reference: "soumission-42", origine: "formulaire_entrant", basesLegales: [{ canal: "courriel", base: "consentement" }],
      // Adresse d'origine réduite à son domaine en mode masqué (un chemin peut identifier la personne).
      origineCoordonnees: { type: "formulaire", collecteLe: "2026-10-01T09:00:00.000Z", url: "https://exemple.be/…" },
    });
    expect(l.texteAccepte).toContain("J'accepte");
  });
  it("complet=1 rend l'adresse d'origine entière ; masquerUrl garde le domaine seul", async () => {
    const { appeler } = banc();
    expect((await registre(appeler({ complet: "1" }))).lignes[0]!.origineCoordonnees?.url).toBe("https://exemple.be/devis");
    expect(masquerUrl("https://partenaire.example/leads/jeanne-dupont?id=7")).toBe("https://partenaire.example/…");
    expect(masquerUrl("pas une url")).toBe("adresse masquée");
  });
  it("complet=0 reste masqué", async () => {
    const { appeler, journal } = banc();
    expect((await registre(appeler({ complet: "0" }))).lignes[0]!.courriel).toBe("j•••@exemple.be");
    expect(journal).toHaveLength(0);
  });
  it("complet=1 rend les coordonnées en clair et journalise l'accès sans aucune valeur personnelle", async () => {
    const { appeler, journal } = banc();
    const r = await registre(appeler({ complet: "1", page: "1", taille: "10" }));
    const l = r.lignes[0]!;
    expect(r.complet).toBe(true);
    expect(l).toMatchObject({ courriel: "jeanne.dupont@exemple.be", telephone: "+32 475 12 34 56", nom: "Jeanne Dupont" });
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ companyId: SOC, type: "consentements.registre_complet", entite: "consentements", acteur: "local-board" });
    expect(journal[0]!["donnees"]).toMatchObject({ complet: true, format: "json", lignes: 1, page: 1, par: "humain:local-board" });
    expect(JSON.stringify(journal)).not.toMatch(/jeanne|dupont|475|exemple\.be/iu);
  });
  it("une valeur chiffrée avec une autre clé vaut [illisible], jamais une erreur ni une fuite", async () => {
    const autre = lu();
    autre.coordonnees = [{ canal: "courriel", valeur: chiffrer("x@y.be", randomBytes(32)) }];
    const { appeler } = banc({ [SOC]: [autre] });
    const l = (await registre(appeler())).lignes[0]!;
    expect(l.courriel).toBe("[illisible]");
    expect(l.telephone).toBeNull();
  });
});

describe("masquage : fonctions pures", () => {
  it("téléphone, courriel, nom, adresse", () => {
    expect(masquerTelephone("+32 4 123 45 67")).toBe("+32 4 ••• •• 67");
    expect(masquerTelephone("+32 475 12 34 56")).toBe("+32 4•• •• •• 56");
    expect(masquerTelephone("0475123456")).toBe("047•••••56");
    expect(masquerTelephone("1234")).toBe("••••");
    expect(masquerCourriel("j.dupont@exemple.be")).toBe("j•••@exemple.be");
    expect(masquerCourriel("sans-arobase")).toBe("•••");
    expect(masquerNom("Jeanne Dupont-Martin")).toBe("J••• D•••");
    expect(masquerAdresse("Rue de la Paix 12, 4000 Liège")).toBe("••••, 4000 Liège");
    expect(masquerAdresse("12 rue seule")).toBe("••••");
  });
});

describe("consentements.registre : pagination bornée et filtres", () => {
  const beaucoup = Array.from({ length: 130 }, (_, i) => lu({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
  it("taille par défaut 25, page demandée, pages calculées", async () => {
    const { appeler, appels } = banc({ [SOC]: beaucoup });
    const p1 = await registre(appeler());
    expect(p1).toMatchObject({ total: 130, page: 1, taille: 25, pages: 6 });
    expect(p1.lignes).toHaveLength(25);
    const p3 = await registre(appeler({ page: "3", taille: "50" }));
    expect(p3.lignes).toHaveLength(30);
    expect(appels.at(-1)).toMatchObject({ limite: 50, decalage: 100 });
  });
  it("taille supérieure à 100, page 0 ou valeur non numérique : refusées", async () => {
    const { appeler, appels } = banc({ [SOC]: beaucoup });
    for (const q of [{ taille: "101" }, { taille: "0" }, { page: "0" }, { page: "x" }, { taille: "1000000" }] as Array<Record<string, string>>) expect(await erreurDe(appeler(q))).not.toBeNull();
    expect(appels).toHaveLength(0);
  });
  it("filtres période et campagne transmis à la lecture ; période inversée, date ou campagne mal formées et paramètre inconnu : refusés", async () => {
    const { appeler, appels } = banc();
    await appeler({ du: "2026-10-01", au: "2026-10-31", campagneId: CAMP });
    expect(appels[0]!.critere).toEqual({ du: "2026-10-01", au: "2026-10-31", campagneId: CAMP });
    await appeler({});
    expect(appels[1]!.critere).toEqual({});
    for (const q of [{ du: "2026-10-31", au: "2026-10-01" }, { du: "hier" }, { campagneId: "pas-un-uuid" }, { inconnu: "1" }, { complet: "oui" }, { format: "xml" }] as Array<Record<string, string>>) {
      expect(await erreurDe(appeler(q))).not.toBeNull();
    }
    expect(appels).toHaveLength(2);
  });
  it("un registre vide rend zéro ligne et une page", async () => {
    const { appeler } = banc({});
    expect(await registre(appeler())).toMatchObject({ lignes: [], total: 0, page: 1, pages: 1 });
  });
});

describe("consentements.registre : export CSV", () => {
  const decoder = (c: unknown) => Buffer.from((c as ReponseExportConsentements).fichier.contenuBase64, "base64").toString("utf8");

  it("rend un fichier CSV masqué : BOM, séparateur « ; », en-têtes français, journal d'export", async () => {
    const { appeler, journal } = banc();
    const { corps } = await appeler({ format: "csv" });
    const e = corps as ReponseExportConsentements;
    const texte = decoder(corps);
    expect(e).toMatchObject({ complet: false, lignes: 1, tronque: false });
    expect(e.fichier).toMatchObject({ nom: "registre-des-consentements-2026-10-22.csv", typeMime: "text/csv;charset=utf-8" });
    expect(texte.startsWith("﻿\"Date du consentement\";\"Prospect\";\"Nom\";\"Courriel\"")).toBe(true);
    expect(texte).toContain("\"Adresse IP (tronquée)\"");
    expect(texte).toContain("\"j•••@exemple.be\"");
    expect(texte).toContain("\"203.0.113.0\"");
    expect(texte).not.toMatch(/jeanne|dupont/iu);
    expect(texte.endsWith("\r\n")).toBe(true);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ type: "consentements.export" });
    expect(journal[0]!["donnees"]).toMatchObject({ complet: false, format: "csv", lignes: 1 });
  });
  it("format=csv&complet=1 : coordonnées en clair, journal du mode complet", async () => {
    const { appeler, journal } = banc();
    const { corps } = await appeler({ format: "csv", complet: "1" });
    expect(decoder(corps)).toContain("jeanne.dupont@exemple.be");
    expect((corps as ReponseExportConsentements).fichier.nom).toBe("registre-des-consentements-2026-10-22-complet.csv");
    expect(journal[0]).toMatchObject({ type: "consentements.registre_complet" });
    expect(journal[0]!["donnees"]).toMatchObject({ complet: true, format: "csv" });
    expect(JSON.stringify(journal)).not.toMatch(/jeanne|dupont/iu);
  });
  it("échappe guillemets, point-virgule et retours à la ligne ; chaque cellule est entre guillemets", () => {
    const l = (async () => (await registre(banc().appeler())).lignes[0]!)();
    return l.then((ligne) => {
      const csv = csvConsentements([{ ...ligne, texteAccepte: "Ligne 1\r\nLigne \"2\"; fin", source: "a;b" }]);
      expect(csv).toContain("\"Ligne 1\r\nLigne \"\"2\"\"; fin\"");
      expect(csv).toContain("\"a;b\"");
    });
  });
  it("neutralise l'injection de formule : =, +, -, @, tabulation, retour chariot", async () => {
    for (const v of ["=1+1", "+33", "-2", "@SUM(A1)", "\tx", "\rx"]) expect(celluleCsv(v)).toBe(`"'${v}"`);
    expect(celluleCsv("normal")).toBe("\"normal\"");
    expect(celluleCsv("a=b")).toBe("\"a=b\"");
    const piege = lu({ preuve: { texteAccepte: "=HYPERLINK(\"http://x\")", source: "@cmd", reference: "-1+1", responsableNomme: "+x", date: "2026-10-01T09:00:00.000Z", canauxAutorises: ["courriel"], retireLe: null, pageCaptation: null, adresseIpTronquee: null } });
    const { appeler } = banc({ [SOC]: [piege] });
    const texte = Buffer.from(((await appeler({ format: "csv" })).corps as ReponseExportConsentements).fichier.contenuBase64, "base64").toString("utf8");
    expect(texte).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(texte).toContain("\"'@cmd\"");
    expect(texte).toContain("\"'-1+1\"");
    expect(texte).toContain("\"'+x\"");
    // Aucune cellule du fichier ne commence par un caractère de formule.
    expect(/(?:^|;)"[=+\-@\t\r]/mu.test(texte.replace(/^﻿/u, ""))).toBe(false);
  });
  it("l'export est borné à 5000 lignes et signale la troncature", async () => {
    const n = 5200;
    const modele = lu();
    const { appeler, appels } = banc({ [SOC]: Array.from({ length: n }, () => modele) });
    const e = (await appeler({ format: "csv" })).corps as ReponseExportConsentements;
    expect(e).toMatchObject({ lignes: 5000, tronque: true });
    expect(Math.max(...appels.map((a) => a.limite))).toBeLessThanOrEqual(500);
  });
});

describe("preuve de consentement : page de captation et IP tronquée", () => {
  const base = { date: "2026-10-01T09:00:00.000Z", texteAccepte: "J'accepte de recevoir des offres par courriel.", source: "https://exemple.be/devis", canauxAutorises: ["courriel"], responsableNomme: "Société Exemple", reference: "soumission-42" };
  it("accepte une IP tronquée et refuse une adresse complète", () => {
    expect(PreuveConsentement.safeParse({ ...base, pageCaptation: "https://exemple.be/devis", adresseIpTronquee: "203.0.113.0" }).success).toBe(true);
    expect(PreuveConsentement.safeParse({ ...base, adresseIpTronquee: "2001:db8:1::" }).success).toBe(true);
    expect(PreuveConsentement.safeParse({ ...base, adresseIpTronquee: "203.0.113.57" }).success).toBe(false);
    expect(PreuveConsentement.safeParse({ ...base, adresseIpTronquee: "2001:db8:1:2:3:4:5:6" }).success).toBe(false);
    expect(PreuveConsentement.safeParse(base).success).toBe(true);
  });
});
