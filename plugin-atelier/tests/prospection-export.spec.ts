/**
 * Lot P9b : base de clients (aperçu, import, état, suppression), étalonnage, export vers le CRM et
 * export fichier, à travers l'aiguillage réel (`atelier.ts`) et les services (`services.ts`,
 * `services-prospection.ts`, `services-base-clients.ts`). Base de l'atelier en mémoire (banc
 * `outils-base.ts`, complété des tables de la migration 007) ; réponses signées par le code RÉEL de la passerelle.
 * Fichiers d'essai : jeu fictif versionné dans `tests/fixtures/base-clients/` (adresses @exemple.invalid).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE, ExportCrm, ImportBaseClients, Prospect } from "../src/contrats/index.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerBase, type BaseAtelier } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { neutraliserCellule } from "../src/serveur/services-base-clients.js";
import { BRIEF, ISSUE, REV1, SOC, creerBanc } from "./outils-base.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";
import { avecClesDonnees, REFS_CLES } from "./outils-cles-donnees.js";

const P = await passerelle();
const CLES = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(CLES.privee);
const AGENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HUMAIN = "local-board";
const ARGS = { nace: ["43"], communes: ["Liège"] };
type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ------------------------------------------------------------------ */
/* Fichiers de démonstration                                           */
/* ------------------------------------------------------------------ */

const DOSSIER_DEMO = fileURLToPath(new URL("./fixtures/base-clients/", import.meta.url));
const lireDemo = (nom: string) => readFileSync(join(DOSSIER_DEMO, nom));
const CORRESPONDANCE = [
  ["identifiant_client", "identifiant_client"], ["type", "type_client"], ["prenom", "prenom"], ["nom", "nom"], ["entreprise", "entreprise"], ["numero_bce", "numero_bce"],
  ["courriel", "courriel"], ["telephone", "telephone"], ["code_postal", "code_postal"], ["commune", "commune"], ["produits_detenus", "produits_detenus"],
  ["date_debut", "debut_contrat"], ["statut", "statut_client"], ["consentement_courriel", "consentement_courriel"], ["consentement_sms", "consentement_sms"],
  ["consentement_telephone", "consentement_telephone"], ["bureau", "ignorer"], ["entite", "ignorer"],
].map(([colonne, cible]) => ({ colonne, cible }));

/* ------------------------------------------------------------------ */
/* Réponses signées (forme du simulateur `bce`)                        */
/* ------------------------------------------------------------------ */

function entite(numero: string, nom: string, courriel?: string) {
  return {
    EnterpriseNumber: numero, Status: "AC", TypeOfEnterprise: "2", JuridicalForm: "610",
    denominations: [{ Language: "1", TypeOfDenomination: "001", Denomination: nom }],
    adresses: [{ TypeOfAddress: "REGO", Zipcode: "4000", MunicipalityFR: "Liège", StreetFR: "Rue de la Démonstration", HouseNumber: "1" }],
    activites: [{ NaceCode: "43910", NaceVersion: "2025", Classification: "MAIN" }],
    contacts: courriel ? [{ EntityContact: "ENT", ContactType: "EMAIL", Value: courriel }] : [],
  };
}
/** 0123.456.749 et 0200.000.043 : modulo 97 valide ; 0999.000.001 : faux (comme les numéros de démonstration). */
const ENTREPRISES = [
  entite("0123.456.749", "Toitures de Meuse", "info@toitures-meuse.exemple.invalid"),
  entite("0999.000.001", "Charpentes fictives", "contact@charpentes.exemple.invalid"),
  entite("0200.000.043", "=SOMME(A1) Couvreurs", "info@couvreurs.exemple.invalid"),
];
function depotBce(mode: "demonstration" | "reel" = "demonstration") {
  const reponse = emballer(SIGNATAIRE, mode, { source: "BCE", total: ENTREPRISES.length, entreprises: ENTREPRISES }, {
    service: "bce", outil: "bce_rechercher", compte: mode === "reel" ? "registre/bce" : "registre/demo-bce", args: ARGS,
  });
  return { service: "bce", outil: "bce_rechercher", reponse, arguments: ARGS };
}

/* ------------------------------------------------------------------ */
/* Banc : base en mémoire complétée des tables 007                     */
/* ------------------------------------------------------------------ */

function banc(o: { modeEntreprise?: "demonstration" | "reel"; config?: Record<string, unknown> } = {}) {
  const b = creerBanc({ modeEntreprise: o.modeEntreprise ?? "demonstration", config: { passerelleClesPubliques: [CLES.publiqueBase64], ...REFS_CLES, ...o.config } });
  avecClesDonnees(b.ctx);
  const t = {
    prospects: [] as Ligne[], empreintes: [] as Ligne[], oppositions: [] as Ligne[], scores: [] as Ligne[], bases: [] as Ligne[],
    imports: [] as Ligne[], clients: [] as Ligne[], etalonnages: [] as Ligne[], exports: [] as Ligne[], regles: [] as Ligne[],
  };
  const copie = <T>(v: T): T => structuredClone(v);
  const ext: Record<string, unknown> = {
    prospectsParIdentifiants: async (c: string, ids: Array<{ type: string; valeur: string }>) =>
      copie(t.prospects.filter((p) => p.companyId === c && ids.some((i) => i.type === p.identifiant.type && i.valeur === p.identifiant.valeur))),
    lireProspect: async (c: string, id: string) => copie(t.prospects.find((p) => p.companyId === c && p.id === id && !p.cleAReimporter) ?? null),
    empreintesProspectsEnBase: async (c: string, v: string[]) => t.empreintes.filter((e) => e.companyId === c && v.includes(e.valeur) && !t.prospects.some((p) => p.id === e.prospectId && p.cleAReimporter)).map((e) => ({ prospectId: e.prospectId, type: e.type, valeur: e.valeur })),
    oppositionsPour: async (c: string, v: string[]) => t.oppositions.filter((x) => x.companyId === c && !x.cleAReimporter && v.includes(x.empreinte)).map((x) => ({ type: x.type, valeur: x.empreinte, canal: x.canal })),
    compterAReimporter: async (c: string) => ({
      prospects: t.prospects.filter((x) => x.companyId === c && x.cleAReimporter).length, clients: t.clients.filter((x) => x.companyId === c && x.cleAReimporter).length,
      imports: t.imports.filter((x) => x.companyId === c && x.cleAReimporter).length, oppositions: t.oppositions.filter((x) => x.companyId === c && x.cleAReimporter).length,
    }),
    remplacerProspectAReimporter: async (c: string, id: string, champs: Ligne) => {
      const p = t.prospects.find((x) => x.companyId === c && x.id === id && x.cleAReimporter);
      if (p) {
        Object.assign(p, copie(champs), { cleAReimporter: false });
        t.empreintes = t.empreintes.filter((e) => e.prospectId !== id);
      }
      return p ? 1 : 0;
    },
    clientsActuelsPour: async () => [],
    dncmPour: async () => null,
    clientExiste: async () => false,
    clientParEmpreinte: async () => null,
    poidsScoreCourant: async () => null,
    referentielProspection: async () => ({ renvoi: null, versionMarque: null }),
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
    prospectsAvecEmpreinte: async (c: string, type: string, v: string) => [...new Set(t.empreintes.filter((e) => e.companyId === c && e.type === type && e.valeur === v).map((e) => e.prospectId))],
    insererScoreProspect: async (s: Ligne) => void t.scores.push(copie(s)),
    detailsProspects: async (c: string, ids: string[]) => ({
      empreintes: new Map(ids.map((id) => [id, t.empreintes.filter((e) => e.companyId === c && e.prospectId === id).map((e) => ({ type: e.type, valeur: e.valeur }))])),
      scores: new Map(t.scores.filter((s) => s.companyId === c && ids.includes(s.prospectId)).map((s) => [s.prospectId, { valeur: s.valeur, criteres: s.criteres, versionPoids: s.versionPoids, calculeLe: s.calculeLe }])),
      bases: new Map(ids.map((id) => [id, copie(t.bases.filter((x) => x.company_id === c && x.prospect_id === id))])),
    }),
    listerProspects: async (c: string, f: Ligne) => {
      const toutes = t.prospects.filter((p) => p.companyId === c && !p.cleAReimporter && (!f.statuts || f.statuts.includes(p.statut)));
      return { total: toutes.length, lignes: copie(toutes.slice((f.page - 1) * f.parPage, f.page * f.parPage)), aReimporter: t.prospects.filter((p) => p.companyId === c && p.cleAReimporter).length };
    },
    insererOpposition: async (x: Ligne) => {
      if (t.oppositions.some((y) => y.companyId === x.companyId && y.type === x.type && y.empreinte === x.empreinte && y.canal === x.canal)) return 0;
      t.oppositions.push({ ...copie(x), enregistreePar: x.par, recueillieLe: x.recueillieLe ?? b.horloge() });
      return 1;
    },
    lireOpposition: async (c: string, type: string, e: string, canal: string) => {
      const x = t.oppositions.find((y) => y.companyId === c && y.type === type && y.empreinte === e && y.canal === canal);
      return x ? { id: x.id, companyId: c, type: x.type, empreinte: x.empreinte, canal: x.canal, origine: x.origine, recueillieLe: x.recueillieLe, enregistreePar: x.enregistreePar } : null;
    },
    // Lot P9b
    insererImportBaseClients: async (i: Ligne) => void t.imports.push(copie(i)),
    insererClients: async (_c: string, cl: Ligne[]) => void t.clients.push(...copie(cl)),
    etatBaseClients: async (c: string) => {
      const i = t.imports.filter((x) => x.companyId === c && !x.cleAReimporter).pop();
      const tous = t.clients.filter((x) => x.companyId === c);
      const clients = tous.filter((x) => !x.cleAReimporter);
      return { dernierImport: i ? { ...i } : null, clients: clients.length, actifs: clients.filter((x) => x.statut === "actif").length, aReimporter: tous.length - clients.length };
    },
    supprimerBaseClients: async (c: string) => {
      const avant = { clients: t.clients.length, imports: t.imports.length };
      t.clients = t.clients.filter((x) => x.companyId !== c);
      t.imports = t.imports.filter((x) => x.companyId !== c);
      return { clients: avant.clients - t.clients.length, imports: avant.imports - t.imports.length };
    },
    reglesVentesCroisees: async (c: string) => copie(t.regles.filter((x) => x.companyId === c)),
    clientsPourVentesCroisees: async (c: string) => copie(t.clients.filter((x) => x.companyId === c && !x.cleAReimporter)),
    insererEtalonnage: async (e: Ligne) => void t.etalonnages.push(copie(e)),
    issuesPourEtalonnage: async () => [],
    scoresCourantsCible: async () => [],
    insererScoreMesure: async (s: Ligne) => void t.scores.push(copie(s)),
    lireExportCrmParCle: async (c: string, cle: string) => copie(t.exports.find((x) => x.companyId === c && x.cleIdempotence === cle) ?? null),
    insererExportCrm: async (e: Ligne) => void t.exports.push(copie(e)),
  };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
  async function appeler(routeKey: string, o2: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; agent?: boolean }) {
    return aiguillage.traiterRequeteApi({
      routeKey, method: "POST", path: "/x", params: o2.params ?? {}, query: o2.query ?? {}, body: o2.body,
      actor: o2.agent ? { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: "run-1" } : { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null },
      companyId: SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const deposer = (mode: "demonstration" | "reel" = "demonstration") => appeler("tache.prospects.deposer", { params: { issueId: BRIEF }, body: depotBce(mode), agent: true });
  /** Base légale « adresse impersonnelle d'une personne morale » pour le courriel. */
  function baseLegale(prospectId: string) {
    t.bases.push({
      company_id: SOC, prospect_id: prospectId, cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
      preuve: { type: "source", reference: "BCE, adresse générique publiée", date: "2026-10-15T10:00:00.000Z" },
      information: { texteArt14: "Vos coordonnées professionnelles proviennent de la Banque-Carrefour des Entreprises.", moyenOpposition: "Lien de désinscription" },
      dncm_verifie_le: null, verifie_le: "2026-10-15T10:00:00.000Z", verifie_par: "humain:local-board",
    });
  }
  const id = (bce: string) => t.prospects.find((p) => p.numeroBce === bce)!.id as string;
  return { ...b, tp: t, appeler, deposer, baseLegale, id, baseComplete: base };
}

const corpsImport = (o: Ligne = {}) => ({
  companyId: SOC, nomFichier: "base-clients.csv", format: "csv", contenuBase64: lireDemo("base-clients.csv").toString("base64"), correspondance: CORRESPONDANCE,
  finalite: "Ventes croisées auprès des clients existants (démonstration)", dureeConservationMois: 24, ...o,
});

/* ------------------------------------------------------------------ */
/* Base de clients                                                     */
/* ------------------------------------------------------------------ */

describe("base de clients", () => {
  it("aperçu XLSX : colonnes, 20 lignes, nombre de lignes ; rien n'est stocké ; humain seulement", async () => {
    const f = banc();
    const corps = { companyId: SOC, nomFichier: "base-clients.xlsx", format: "xlsx", contenuBase64: lireDemo("base-clients.xlsx").toString("base64") };
    const r = await f.appeler("base-clients.apercu", { body: corps });
    expect(r.status).toBe(200);
    expect(r.body.colonnes).toEqual(CORRESPONDANCE.map((c) => c.colonne));
    expect(r.body.apercu).toHaveLength(20);
    expect(r.body.lignes).toBe(105);
    expect(r.body.colonnesSensiblesRefusees).toEqual([]);
    expect(f.tp.clients).toEqual([]);
    expect((await f.appeler("base-clients.apercu", { body: corps, agent: true })).status).toBe(403);
    const pieges = await f.appeler("base-clients.apercu", { body: { ...corps, nomFichier: "pieges.csv", format: "csv", contenuBase64: lireDemo("base-clients-pieges.csv").toString("base64") } });
    expect(pieges.body.colonnesSensiblesRefusees ?? pieges.body.details?.colonnesSensiblesRefusees).toContain("remarque_sinistre");
  });

  it("import CSV de démonstration : rapport ImportBaseClients, clients stockés sans aucune valeur en clair ; état lisible", async () => {
    const f = banc();
    const r = await f.appeler("base-clients.importer", { body: corpsImport() });
    expect(r.status).toBe(201);
    const imp = ImportBaseClients.parse(r.body);
    expect(imp.lignesLues).toBe(105);
    // Les entreprises clientes du jeu de démonstration ont des numéros BCE volontairement faux (modulo 97) :
    // en démonstration, seule la forme est contrôlée, donc les 105 lignes (75 particuliers, 30 entreprises) sont retenues.
    expect(imp.lignesRetenues).toBe(105);
    expect(imp.lignesRejetees).toBe(0);
    expect(imp.rejets).toEqual([]);
    expect(imp.mode).toBe("demonstration");
    expect(f.tp.clients).toHaveLength(imp.lignesRetenues);
    const premiere = lireDemo("base-clients.csv").toString("utf8").split("\n")[1]!.split(";");
    const stocke = JSON.stringify({ clients: f.tp.clients, imports: f.tp.imports, journal: f.t.journal });
    for (const clair of [premiere[2], premiere[3], premiere[6], premiere[7]]) expect(stocke).not.toContain(clair);
    expect(Object.values(f.tp.clients[0]!.donneesChiffrees as Record<string, string>).every((v) => v.startsWith("chv1."))).toBe(true);
    expect(f.t.journal.map((j) => j.type)).toContain("base_clients.importee");

    const etat = await f.appeler("base-clients.etat", { query: { companyId: SOC } });
    expect(etat.status).toBe(200);
    expect(etat.body).toMatchObject({ existe: true, clients: imp.lignesRetenues, purgeLe: imp.purgeLe, finalite: imp.finalite, dureeConservationMois: 24, aPurger: false });
    // Un second import remplace la base.
    await f.appeler("base-clients.importer", { body: corpsImport() });
    expect(f.tp.clients).toHaveLength(imp.lignesRetenues);
  });

  it("colonne sensible associée : import refusé avec la colonne nommée ; agent refusé", async () => {
    const f = banc();
    const pieges = corpsImport({ nomFichier: "pieges.csv", contenuBase64: lireDemo("base-clients-pieges.csv").toString("base64"), correspondance: [...CORRESPONDANCE, { colonne: "remarque_sinistre", cible: "ignorer" }] });
    const r = await f.appeler("base-clients.importer", { body: pieges });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(f.tp.clients).toEqual([]);
    expect((await f.appeler("base-clients.importer", { body: corpsImport(), agent: true })).status).toBe(403);
  });

  it("suppression : clients supprimés, oppositions gardées, journalisée ; humain seulement", async () => {
    const f = banc();
    await f.appeler("base-clients.importer", { body: corpsImport() });
    expect((await f.appeler("oppositions.ajouter", { body: { companyId: SOC, type: "courriel", valeur: "opposant@exemple.invalid", canal: "tous", origine: "demande_ecrite" } })).status).toBe(201);
    const corps = { companyId: SOC, confirmation: "SUPPRIMER LA BASE CLIENTS", motif: "Fin de la démonstration" };
    expect((await f.appeler("base-clients.supprimer", { body: corps, agent: true })).status).toBe(403);
    const r = await f.appeler("base-clients.supprimer", { body: corps });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ importsSupprimes: 1, oppositionsGardees: true });
    expect(r.body.clientsSupprimes).toBeGreaterThan(70);
    expect(f.tp.clients).toEqual([]);
    expect(f.tp.oppositions).toHaveLength(1);
    expect(f.t.journal.map((j) => j.type)).toContain("base_clients.supprimee");
    expect((await f.appeler("base-clients.etat", { query: { companyId: SOC } })).body).toMatchObject({ existe: false, clients: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* Ventes croisées                                                     */
/* ------------------------------------------------------------------ */

describe("ventes-croisees.lister", () => {
  const lister = (f: ReturnType<typeof banc>, agent = false) => f.appeler("ventes-croisees.lister", { query: { companyId: SOC }, agent });

  it("base de démonstration : règles fixes du courtier, opportunités sous pseudonyme, aucune coordonnée ni identifiant en clair ; humain seulement", async () => {
    const f = banc();
    const vide = await lister(f);
    expect(vide.status).toBe(200);
    expect(vide.body).toMatchObject({ clients: 0, opportunites: [], origineRegles: "demonstration" });
    await f.appeler("base-clients.importer", { body: corpsImport() });
    const r = await lister(f);
    expect(r.status).toBe(200);
    expect(r.body.regles.map((x: Ligne) => `${x.typeClient}:${x.detenue}>${x.proposee}`)).toEqual(["particulier:auto>habitation", "particulier:habitation>familiale", "entreprise:rc-pro>multirisque"]);
    const ops = r.body.opportunites as Ligne[];
    expect(ops.length).toBeGreaterThan(5);
    expect(ops.some((o) => o.typeClient === "particulier" && o.detenus.includes("auto") && o.proposes.includes("habitation"))).toBe(true);
    for (const o of ops) {
      expect(o.pseudonyme).toMatch(/^\[client-[0-9a-f]{4,16}\]$/u);
      expect(Object.keys(o).sort()).toEqual(["canaux", "canauxPermis", "codePostal", "commune", "detenus", "mode", "proposes", "pseudonyme", "typeClient"]);
      expect(o.proposes.every((x: string) => !o.detenus.includes(x))).toBe(true);
    }
    // Aucune valeur en clair du fichier (nom, prénom, courriel, téléphone, identifiant) dans la réponse.
    const texte = JSON.stringify(r.body);
    for (const ligne of lireDemo("base-clients.csv").toString("utf8").trim().split("\n").slice(1, 40)) {
      const v = ligne.split(";");
      for (const clair of [v[0], v[2], v[3], v[6], v[7]].filter((x) => x && x.length > 3)) expect(texte).not.toContain(clair);
    }
    expect(texte).not.toContain("chv1.");
    expect((await lister(f, true)).status).toBe(403);
  });

  it("canal permis par la matrice : consentement déclaré ou exception client existant pour le courriel ; téléphone jamais sans liste « Ne m'appelez plus »", async () => {
    const f = banc();
    await f.appeler("base-clients.importer", { body: corpsImport() });
    const ops = (await lister(f)).body.opportunites as Ligne[];
    const part = ops.filter((o) => o.typeClient === "particulier");
    expect(part.some((o) => o.canauxPermis.includes("courriel"))).toBe(true);
    for (const o of ops) {
      const tel = o.canaux.find((c: Ligne) => c.canal === "telephone");
      expect(tel.permis).toBe(false);
      expect(o.canauxPermis).toEqual(o.canaux.filter((c: Ligne) => c.permis).map((c: Ligne) => c.canal));
    }
    // Un client qui a déclaré NON au courriel n'est jamais contacté par courriel.
    const refusants = new Set(f.tp.clients.filter((c) => c.consentements.courriel === false).map((c) => c.pseudonyme as string));
    const visees = ops.filter((o) => refusants.has(o.pseudonyme));
    expect(visees.length).toBeGreaterThan(0);
    for (const o of visees) expect(o.canaux.find((c: Ligne) => c.canal === "courriel")).toMatchObject({ permis: false, motif: expect.stringContaining("refusé") });
    // Entreprises : la matrice actuelle ne couvre pas l'exception « client existant » en B2B, le refus reste, motif lisible.
    const entreprises = ops.filter((o) => o.typeClient === "entreprise");
    expect(entreprises.length).toBeGreaterThan(0);
    for (const o of entreprises) {
      expect(o.canauxPermis).toEqual([]);
      expect(o.canaux.find((c: Ligne) => c.canal === "courriel").motif).toMatch(/B2B|refusé/u);
    }
  });

  it("règles enregistrées par le client : elles remplacent les règles de démonstration", async () => {
    const f = banc();
    await f.appeler("base-clients.importer", { body: corpsImport() });
    f.tp.regles.push({ companyId: SOC, typeClient: "particulier", detenue: "auto", proposee: "obseques", decidePar: "humain:local-board", decideLe: "2026-10-15T10:00:00.000Z" });
    const r = await lister(f);
    expect(r.body.origineRegles).toBe("client");
    expect(new Set((r.body.opportunites as Ligne[]).flatMap((o) => o.proposes))).toEqual(new Set(["obseques"]));
  });

  it("mode réel sans règle du client : aucune règle inventée, aucune opportunité", async () => {
    const f = banc({ modeEntreprise: "reel" });
    f.tp.clients.push({ companyId: SOC, id: "x" });
    const r = await lister(f);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ origineRegles: "aucune", regles: [], opportunites: [] });
  });
});

/* ------------------------------------------------------------------ */
/* Étalonnage                                                          */
/* ------------------------------------------------------------------ */

describe("etalonnage.calculer", () => {
  const corps = (cible: string) => ({
    companyId: SOC, segment: { cible, nace: [] },
    historique: { nomFichier: "historique-opportunites.csv", format: "csv", contenuBase64: lireDemo("historique-opportunites.csv").toString("base64") },
  });

  it("historique de démonstration : particuliers en « probabilité mesurée », entreprises (moins de 300 issues) en « estimation » ; stocké et journalisé", async () => {
    const f = banc();
    const part = await f.appeler("etalonnage.calculer", { body: corps("particulier") });
    expect(part.status).toBe(201);
    expect(part.body.etalonnage).toMatchObject({ statut: "probabilite_mesuree", methode: "platt", separation: "decoupage_temporel", mode: "demonstration" });
    expect(part.body.etalonnage.effectif).toBeGreaterThanOrEqual(300);
    expect(part.body.etalonnage.conversions).toBeGreaterThanOrEqual(30);
    expect(part.body.etalonnage.donnees.origines).toEqual(["import"]);
    const ent = await f.appeler("etalonnage.calculer", { body: corps("entreprise") });
    expect(ent.status).toBe(201);
    expect(ent.body.etalonnage.statut).toBe("estimation");
    expect(ent.body.etalonnage.effectif).toBeLessThan(300);
    expect(f.tp.etalonnages).toHaveLength(2);
    expect(f.t.journal.filter((j) => j.type === "etalonnage.calcule")).toHaveLength(2);
  });

  it("humain seulement ; NACE refusé sur un historique sans NACE ; sans issue : refus", async () => {
    const f = banc();
    expect((await f.appeler("etalonnage.calculer", { body: corps("particulier"), agent: true })).status).toBe(403);
    expect((await f.appeler("etalonnage.calculer", { body: { ...corps("entreprise"), segment: { cible: "entreprise", nace: ["43"] } } })).status).toBe(400);
    expect((await f.appeler("etalonnage.calculer", { body: { companyId: SOC, segment: { cible: "entreprise", nace: [] } } })).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* Export vers le CRM                                                  */
/* ------------------------------------------------------------------ */

describe("tache.prospects.exporter", () => {
  const demande = (f: ReturnType<typeof banc>, cle: string) => ({ prospectIds: [f.id("0123.456.749")], canal: "courriel", service: "crm", entite: "non-vie", cleIdempotence: cle });
  const exporter = (f: ReturnType<typeof banc>, corps: unknown) => f.appeler("tache.prospects.exporter", { params: { issueId: ISSUE }, body: corps, agent: true });

  it("sans base légale enregistrée : 403, export refusé et motivé, aucune diffusion", async () => {
    const f = banc();
    f.tacheSousPorte();
    await f.deposer();
    const r = await exporter(f, demande(f, "export-sans-base"));
    expect(r.status).toBe(403);
    expect(r.body.etat).toBe("refusee");
    expect(ExportCrm.parse(r.body.export).motifRefus).toMatch(/Aucune base légale enregistrée pour le canal courriel/u);
    expect(r.body.verifications[0]).toMatchObject({ ok: false });
    expect(f.t.diffusions).toEqual([]);
    // Rejouée avec la même clé : même réponse, rien de nouveau.
    expect((await exporter(f, demande(f, "export-sans-base"))).status).toBe(403);
    expect(f.tp.exports).toHaveLength(1);
  });

  it("opposition du contact : 403 (prospect exclu)", async () => {
    const f = banc();
    f.tacheSousPorte();
    await f.deposer();
    f.baseLegale(f.id("0123.456.749"));
    await f.appeler("oppositions.ajouter", { body: { companyId: SOC, type: "courriel", valeur: "info@toitures-meuse.exemple.invalid", canal: "tous", origine: "demande_ecrite" } });
    const r = await exporter(f, demande(f, "export-oppose"));
    expect(r.status).toBe(403);
    expect(r.body.verifications[0].motif).toMatch(/opposition_client/u);
    expect(f.t.diffusions).toEqual([]);
  });

  it("export valide : appel exact proposé, en attente d'approbation (rien ne part) ; après approbation : diffusion simulée en démonstration", async () => {
    const f = banc();
    f.tacheSousPorte();
    await f.deposer();
    f.baseLegale(f.id("0123.456.749"));
    const r = await exporter(f, demande(f, "export-valide"));
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ etat: "en_attente_approbation", export: null, diffusion: null });
    expect(r.body.verifications).toEqual([{ prospectId: f.id("0123.456.749"), ok: true, motif: null }]);
    expect(r.body.appel).toMatchObject({ service: "crm", outil: "crm_creer_contact", compte: "crm/demonstration" });
    expect(f.t.appels).toHaveLength(1);
    expect(f.t.diffusions).toEqual([]);
    expect(f.tp.exports).toEqual([]);

    // L'humain approuve la révision (portée modifier_crm sur crm) : la même demande crée la diffusion, simulée.
    f.issues.get(ISSUE)!.status = "done";
    f.passe();
    f.decision({ portee: { revisionId: REV1, action: "modifier_crm", canal: "crm", compte: null, audience: null, montantMaxCents: null, dureeJours: null } });
    const ok = await exporter(f, demande(f, "export-valide"));
    expect(ok.status).toBe(201);
    expect(ok.body.etat).toBe("simulee");
    expect(ExportCrm.parse(ok.body.export)).toMatchObject({ etat: "simulee", mode: "demonstration", service: "crm", canal: "courriel" });
    expect(f.t.diffusions).toHaveLength(1);
    expect(f.t.diffusions[0]).toMatchObject({ etat: "simulee", action: "modifier_crm", outil: "crm_creer_contact" });
    expect(ok.body.diffusion.preuveApprobation ?? null).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Numéros BCE de démonstration                                        */
/* ------------------------------------------------------------------ */

describe("numéros BCE de démonstration (modulo 97 faux)", () => {
  it("non exclus en démonstration, exclus en réel", async () => {
    const demo = banc();
    expect((await demo.deposer()).status).toBe(201);
    expect(demo.tp.prospects.find((p) => p.numeroBce === "0999.000.001")).toMatchObject({ statut: "nouveau", motifsExclusion: [] });

    const refs = { donneesCleChiffrement: { type: "secret_ref", secretId: "a" }, donneesCleHmac: { type: "secret_ref", secretId: "b" } };
    const reel = banc({ modeEntreprise: "reel", config: refs });
    (reel.ctx as Ligne).secrets = { resolve: async (_r: unknown, o: { configPath: string }) => Buffer.alloc(32, o.configPath === "donneesCleChiffrement" ? 1 : 2).toString("base64") };
    const r = await reel.deposer("reel");
    expect(r.status).toBe(201);
    const fictif = (r.body.prospects as Prospect[]).find((p) => p.numeroBce === "0999.000.001")!;
    expect(fictif.motifsExclusion.map((m) => m.motif)).toContain("numero_bce_invalide");
  });
});

/* ------------------------------------------------------------------ */
/* Export fichier                                                      */
/* ------------------------------------------------------------------ */

describe("prospects.exporter-fichier", () => {
  async function prepare() {
    const f = banc();
    await f.deposer();
    f.baseLegale(f.id("0123.456.749"));
    f.baseLegale(f.id("0200.000.043"));
    return f;
  }

  it("CSV : seuls les prospects contactables, coordonnées déchiffrées, formules neutralisées, mention démonstration, journalisé", async () => {
    const f = await prepare();
    const r = await f.appeler("prospects.exporter-fichier", { body: { companyId: SOC, canal: "courriel", format: "csv" } });
    expect(r.status).toBe(201);
    expect(r.body.nomFichier).toMatch(/^prospects-courriel-\d{4}-\d{2}-\d{2} \(démonstration\)\.csv$/u);
    const texte = Buffer.from(r.body.contenuBase64, "base64").toString("utf8");
    const lignes = texte.replace(/^﻿/u, "").trim().split("\r\n");
    expect(lignes[0]).toBe("identifiant;cible;nom_ou_entreprise;numero_bce;courriel;telephone;code_postal;commune;score;libelle_score;base_legale;source;date_source");
    expect(lignes).toHaveLength(3);
    expect(texte).toContain("info@toitures-meuse.exemple.invalid");
    expect(texte).toContain("'=SOMME(A1) Couvreurs");
    expect(texte).not.toContain("charpentes.exemple.invalid");
    expect(r.body.rapport).toMatchObject({ demandes: 3, inclus: 2 });
    expect(r.body.rapport.refuses).toEqual([{ prospectId: f.id("0999.000.001"), denomination: "Charpentes fictives", motif: expect.stringMatching(/Aucune base légale/u) }]);
    const j = f.t.journal.find((x) => x.type === "prospects.export_fichier")!;
    expect(j.donnees).toMatchObject({ inclus: 2, refuses: 1, format: "csv", canal: "courriel", empreinteFichier: r.body.empreinteFichier });
    expect(JSON.stringify(j)).not.toContain("toitures-meuse");
    expect((await f.appeler("prospects.exporter-fichier", { body: { companyId: SOC, canal: "courriel", format: "csv" }, agent: true })).status).toBe(403);
  });

  it("XLSX : classeur lisible, mêmes colonnes, valeurs neutralisées", async () => {
    const f = await prepare();
    const r = await f.appeler("prospects.exporter-fichier", { body: { companyId: SOC, canal: "courriel", format: "xlsx", prospectIds: [f.id("0123.456.749"), f.id("0200.000.043")] } });
    expect(r.status).toBe(201);
    expect(r.body.typeMime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const classeur = XLSX.read(Buffer.from(r.body.contenuBase64, "base64"), { type: "buffer" });
    const lignes = XLSX.utils.sheet_to_json<string[]>(classeur.Sheets[classeur.SheetNames[0]!]!, { header: 1 });
    expect(lignes[0]![4]).toBe("courriel");
    expect(lignes).toHaveLength(3);
    expect(lignes.map((l) => l[2])).toContain("'=SOMME(A1) Couvreurs");
    expect(lignes.map((l) => l[4])).toContain("info@toitures-meuse.exemple.invalid");
    expect(r.body.rapport).toMatchObject({ demandes: 2, inclus: 2, refuses: [] });
  });

  it("neutralisation : = + - @ tabulation", () => {
    for (const v of ["=1", "+1", "-1", "@a", "\tx"]) expect(neutraliserCellule(v)).toBe(`'${v}`);
    expect(neutraliserCellule("Liège")).toBe("Liège");
  });
});

/* ------------------------------------------------------------------ */
/* SQL ajouté (base.ts réelle, règles de l'hôte)                       */
/* ------------------------------------------------------------------ */

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
  for (const m of normal.matchAll(/\b(?:from|join|references|into|update)\s+"?([a-z_][a-z0-9_]*)"?\."?[a-z_]/gu)) {
    if (m[1] !== ESPACE_BASE) throw new Error(`schéma étranger ${m[1]} : ${sql}`);
  }
  const vus = new Set([...sql.matchAll(/\$(\d+)/gu)].map((m) => Number(m[1])));
  for (const n of vus) if (n < 1 || n > params.length) throw new Error(`$${n} sans paramètre : ${sql}`);
  if (vus.size !== params.length) throw new Error(`paramètre non référencé : ${sql}`);
}

describe("SQL du lot P9b (base.ts réelle, règles de l'hôte)", () => {
  it("toutes les fonctions ajoutées passent les règles ; la purge de démonstration couvre la prospection et la base de clients", async () => {
    const tables: string[] = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, true);
        return [];
      },
      async execute(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, false);
        const m = /delete from \S+\.(\w+)/u.exec(sql);
        if (m) tables.push(m[1]!);
        return { rowCount: 1 };
      },
    };
    const base = creerBase(db as unknown as PluginContext["db"]);
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const date = new Date().toISOString();
    await base.insererImportBaseClients({ id, companyId: SOC, nomFichier: "a.csv", format: "csv", empreinteFichier: "a".repeat(64), lignesLues: 1, lignesRetenues: 1, lignesRejetees: 0, rejets: [], correspondance: [], colonnesSensiblesRefusees: [], finalite: "Finalité de test", dureeConservationMois: 24, purgeLe: date, mode: "demonstration", importePar: "humain:x", importeLe: date });
    await base.insererClients(SOC, [{ id, empreintes: [{ type: "courriel", valeur: "a".repeat(64) }] }]);
    await base.etatBaseClients(SOC);
    await base.supprimerBaseClients(SOC);
    await base.insererEtalonnage({ id, companyId: SOC, segment: {}, methode: "platt", parametres: { a: 1, b: 0 }, separation: "decoupage_temporel", horizonJours: 90, effectif: 1, conversions: 0, brier: 0.1, tranches: [], statut: "estimation", versionPoids: 1, donnees: {}, mode: "demonstration", calculePar: "humain:x", calculeLe: date });
    await base.issuesPourEtalonnage(SOC, "entreprise", "demonstration");
    await base.scoresCourantsCible(SOC, "entreprise");
    await base.insererScoreMesure({ id, companyId: SOC, prospectId: id, valeur: 10, criteres: [], versionPoids: 1, etalonnageId: id, probabilite: 0.1, borneBasse: 0.05, borneHaute: 0.2, calculeLe: date });
    await base.lireExportCrmParCle(SOC, "cle-test-1");
    await base.insererExportCrm({ id, companyId: SOC, issueId: id, diffusionId: null, entite: "e", referentielVersion: 1, service: "crm", canal: "courriel", prospectIds: [id], verifications: [], etat: "refusee", motifRefus: "m", cleIdempotence: "cle-test-1", mode: "demonstration", demandePar: "agent:x", creeLe: date });
    await base.detailsProspects(SOC, [id]);
    tables.length = 0;
    await base.supprimerDonneesEntreprise(SOC);
    for (const t of ["exports_crm", "issues_commerciales", "prospects", "prospects_scores", "etalonnages", "clients", "bases_clients_imports", "diffusions"]) expect(tables).toContain(t);
    // M1 : obligations légales jamais effacées par la remise à zéro.
    for (const t of ["oppositions", "listes_dncm", "dncm_empreintes", "bases_legales", "journal"]) expect(tables).not.toContain(t);
    expect(tables.indexOf("exports_crm")).toBeLessThan(tables.indexOf("diffusions"));
  });
});

/* ------------------------------------------------------------------ */
/* Faille E1 : lignes à réimporter (migration 016, colonne cle_a_reimporter) */
/* ------------------------------------------------------------------ */

describe("lignes à réimporter (cle_a_reimporter)", () => {
  const OPPOSITION_MARQUEE = { companyId: SOC, type: "courriel", empreinte: "f".repeat(64), canal: "tous", origine: "demande_ecrite", cleAReimporter: true };
  const MESSAGE = /des oppositions doivent être recueillies à nouveau avant tout export/iu;
  async function preparee() {
    const f = banc();
    f.tacheSousPorte();
    await f.deposer();
    f.baseLegale(f.id("0123.456.749"));
    f.baseLegale(f.id("0200.000.043"));
    return f;
  }

  it("RGPD : une opposition marquée fait refuser l'export fichier (409, message clair, rien d'exporté ni journalisé)", async () => {
    const f = await preparee();
    f.tp.oppositions.push({ ...OPPOSITION_MARQUEE });
    for (const corps of [
      { companyId: SOC, canal: "courriel", format: "csv" },
      { companyId: SOC, canal: "courriel", format: "csv", prospectIds: [f.id("0123.456.749")] },
    ]) {
      const r = await f.appeler("prospects.exporter-fichier", { body: corps });
      expect(r.status).toBe(409);
      expect(JSON.stringify(r.body)).toMatch(MESSAGE);
      expect(r.body.contenuBase64).toBeUndefined();
    }
    expect(f.t.journal.some((x) => x.type === "prospects.export_fichier")).toBe(false);
  });

  it("RGPD : la même opposition marquée fait refuser l'export CRM et la lecture des ventes croisées", async () => {
    const f = await preparee();
    f.tp.oppositions.push({ ...OPPOSITION_MARQUEE });
    const crm = await f.appeler("tache.prospects.exporter", {
      params: { issueId: ISSUE }, agent: true,
      body: { prospectIds: [f.id("0123.456.749")], canal: "courriel", service: "crm", entite: "non-vie", cleIdempotence: "export-marque" },
    });
    expect(crm.status).toBe(409);
    expect(JSON.stringify(crm.body)).toMatch(MESSAGE);
    expect(f.tp.exports).toEqual([]);
    expect(f.t.diffusions).toEqual([]);
    const vc = await f.appeler("ventes-croisees.lister", { query: { companyId: SOC } });
    expect(vc.status).toBe(409);
    expect(JSON.stringify(vc.body)).toMatch(MESSAGE);
  });

  it("une opposition marquée n'est jamais comptée comme lue ; une opposition valide ne bloque pas l'export", async () => {
    const f = await preparee();
    f.tp.oppositions.push({ ...OPPOSITION_MARQUEE, cleAReimporter: false });
    expect((await f.appeler("prospects.exporter-fichier", { body: { companyId: SOC, canal: "courriel", format: "csv" } })).status).toBe(201);
    expect(await f.baseComplete.oppositionsPour(SOC, ["f".repeat(64)])).toHaveLength(1);
    f.tp.oppositions[0]!.cleAReimporter = true;
    expect(await f.baseComplete.oppositionsPour(SOC, ["f".repeat(64)])).toEqual([]);
  });

  it("prospects marqués : exclus de la liste et de l'export, comptés à part ; l'export reste permis sans opposition marquée", async () => {
    const f = await preparee();
    f.tp.prospects.find((p) => p.id === f.id("0200.000.043"))!.cleAReimporter = true;
    const liste = await f.appeler("prospects.lister", { query: { companyId: SOC } });
    expect(liste.status).toBe(200);
    expect(liste.body.total).toBe(2);
    expect(liste.body.aReimporter).toBe(1);
    expect(liste.body.informationReimport).toMatch(/1 fiche\(s\) à réimporter/u);
    const r = await f.appeler("prospects.exporter-fichier", { body: { companyId: SOC, canal: "courriel", format: "csv" } });
    expect(r.status).toBe(201);
    expect(Buffer.from(r.body.contenuBase64, "base64").toString("utf8")).not.toContain("Couvreurs");
    expect(r.body.rapport.demandes).toBe(2);
  });

  it("nouveau dépôt d'un prospect marqué : la fiche est remplacée (clé du coffre), anciennes empreintes et coordonnées écartées, marque levée", async () => {
    const f = await preparee();
    const p = f.tp.prospects.find((x) => x.id === f.id("0123.456.749"))!;
    p.cleAReimporter = true;
    p.coordonnees = [{ canal: "courriel", empreinte: "ancienne-cle", chiffre: "chv1:ancien" }];
    f.tp.empreintes.push({ companyId: SOC, prospectId: p.id, type: "courriel", valeur: "ancienne-cle" });
    expect((await f.deposer()).status).toBe(201);
    const apres = f.tp.prospects.find((x) => x.id === p.id)!;
    expect(apres.cleAReimporter).toBe(false);
    expect(JSON.stringify(apres.coordonnees)).not.toContain("ancienne-cle");
    expect(f.tp.empreintes.some((e) => e.valeur === "ancienne-cle")).toBe(false);
    expect(f.tp.prospects.filter((x) => x.identifiant.valeur === p.identifiant.valeur)).toHaveLength(1);
  });

  it("clients marqués : exclus de l'état et des ventes croisées, comptés à part ; un nouvel import les remplace sans toucher aux oppositions", async () => {
    const f = banc();
    await f.appeler("base-clients.importer", { body: corpsImport() });
    const total = f.tp.clients.length;
    for (const c of f.tp.clients.slice(0, 5)) c.cleAReimporter = true;
    f.tp.imports[0]!.cleAReimporter = true;
    f.tp.oppositions.push({ ...OPPOSITION_MARQUEE });
    const etat = await f.appeler("base-clients.etat", { query: { companyId: SOC } });
    expect(etat.body).toMatchObject({ clients: total - 5, aReimporter: 5, existe: false });
    expect(await f.baseComplete.clientsPourVentesCroisees(SOC)).toHaveLength(total - 5);
    const r = await f.appeler("base-clients.importer", { body: corpsImport() });
    expect(r.status).toBe(201);
    expect(f.tp.clients).toHaveLength(total);
    expect(f.tp.clients.some((c) => c.cleAReimporter)).toBe(false);
    expect(f.tp.imports.some((i) => i.cleAReimporter)).toBe(false);
    expect((await f.appeler("base-clients.etat", { query: { companyId: SOC } })).body).toMatchObject({ clients: total, aReimporter: 0, existe: true });
    expect(f.tp.oppositions).toEqual([OPPOSITION_MARQUEE]);
  });
});

describe("SQL des lectures : exclusion des lignes à réimporter (base.ts réelle)", () => {
  function capture(reponses: (sql: string) => unknown[] = () => []) {
    const lus: string[] = [];
    const ecrits: string[] = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, true);
        lus.push(sql);
        return reponses(sql);
      },
      async execute(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, false);
        ecrits.push(sql);
        return { rowCount: 1 };
      },
    };
    return { base: creerBase(db as unknown as PluginContext["db"]), lus, ecrits };
  }
  const H = ["a".repeat(64)];
  const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("chaque lecture d'une des quatre tables exclut cle_a_reimporter", async () => {
    const { base, lus } = capture();
    await base.lireProspect(SOC, ID);
    await base.empreintesProspectsEnBase(SOC, H);
    await base.oppositionsPour(SOC, H);
    await base.clientsActuelsPour(SOC, H);
    await base.clientExiste(SOC, ID);
    await base.clientParEmpreinte(SOC, "identifiant_client", H[0]!);
    await base.etatBaseClients(SOC);
    await base.clientsPourVentesCroisees(SOC);
    for (const sql of lus.filter((s) => !/count\(\*\) from \S+\.prospects where company_id = \$1 and cle_a_reimporter/u.test(s))) {
      expect(sql, sql).toMatch(/cle_a_reimporter/u);
    }
    expect(lus).toHaveLength(9);
  });

  it("listerProspects exclut les fiches marquées de la page et du total, et compte les marquées à part", async () => {
    const { base, lus } = capture((sql) => (/count\(\*\) as total from \S+\.prospects p where/u.test(sql) ? [{ total: "3" }] : /cle_a_reimporter$/u.test(sql.trim()) ? [{ total: "4" }] : []));
    const r = await base.listerProspects(SOC, { page: 1, parPage: 10 });
    expect(r).toMatchObject({ total: 3, lignes: [], aReimporter: 4 });
    const pageEtTotal = lus.filter((s) => /from \S+\.prospects p where/u.test(s));
    expect(pageEtTotal).toHaveLength(2);
    for (const s of pageEtTotal) expect(s).toContain("p.cle_a_reimporter = false");
  });

  it("compterAReimporter compte les quatre tables de l'entreprise ; remplacerProspectAReimporter lève la marque et retire les anciennes empreintes", async () => {
    const { base, ecrits } = capture((sql) => (/as oppositions/u.test(sql) ? [{ prospects: "1", clients: "2", imports: "3", oppositions: "4" }] : []));
    expect(await base.compterAReimporter(SOC)).toEqual({ prospects: 1, clients: 2, imports: 3, oppositions: 4 });
    await base.remplacerProspectAReimporter(SOC, ID, { nomChiffre: null, nace: [], zone: {}, coordonnees: [], sources: [], statut: "nouveau", motifsExclusion: [], particulier: null });
    expect(ecrits[0]).toMatch(/cle_a_reimporter = false[\s\S]*and cle_a_reimporter/u);
    expect(ecrits[1]).toMatch(/delete from \S+\.prospects_empreintes where company_id = \$1 and prospect_id = \$2/u);
  });
});
