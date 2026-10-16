/**
 * Lot P9a : routes de prospection à travers l'aiguillage réel (`atelier.ts`) et les services
 * (`services.ts`, `services-prospection.ts`). Base de l'atelier en mémoire (banc `outils-base.ts`,
 * complété ici des tables de la migration 007) ; signatures produites par le code RÉEL de la passerelle.
 * Un dernier bloc fait passer les requêtes SQL de `base.ts` par une copie des règles de l'hôte.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE, CompteRenduProspect, CriteresManquants, Opposition, PageProspects, Prospect } from "../src/contrats/index.js";
import { REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerBase, type BaseAtelier } from "../src/serveur/base.js";
import { dechiffrer, empreinte } from "../src/serveur/chiffrement-donnees.js";
import { creerServices } from "../src/serveur/services.js";
import { clesDemonstration, extraireChangementsBce, extraireComptesBnb, extraireProspects, regionDuCodePostal } from "../src/serveur/services-prospection.js";
import { BRIEF, CAMP, SOC, creerBanc } from "./outils-base.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";

const P = await passerelle();
const CLES = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(CLES.privee);
const AUTRE = new P.SignataireEnveloppe(paireEd25519().privee);
const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HUMAIN = "local-board";
const ARGS = { nace: ["43"], communes: ["Liège"] };

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ------------------------------------------------------------------ */
/* Données de réponse (forme du simulateur `bce` de la passerelle)     */
/* ------------------------------------------------------------------ */

function entite(numero: string, nom: string, o: { type?: string; cp?: string; commune?: string; courriel?: string; tel?: string } = {}) {
  const contacts: Ligne[] = [];
  if (o.tel) contacts.push({ EntityContact: "ENT", ContactType: "TEL", Value: o.tel });
  if (o.courriel) contacts.push({ EntityContact: "ENT", ContactType: "EMAIL", Value: o.courriel });
  return {
    EnterpriseNumber: numero, Status: "AC", TypeOfEnterprise: o.type ?? "2", JuridicalForm: "610",
    denominations: [{ Language: "1", TypeOfDenomination: "001", Denomination: nom }],
    adresses: [{ TypeOfAddress: "REGO", Zipcode: o.cp ?? "4000", MunicipalityFR: o.commune ?? "Liège", StreetFR: "Rue de la Démonstration", HouseNumber: "1" }],
    activites: [{ NaceCode: "43910", NaceVersion: "2025", Classification: "MAIN" }],
    contacts,
  };
}

/** 0123.456.749 : contrôle modulo 97 valide ; 0999.000.001 : contrôle faux (comme les numéros de démonstration). */
const ENTREPRISES = [
  entite("0123.456.749", "Toitures de Meuse", { courriel: "info@toitures-meuse.example", tel: "+32 4 000 11 22" }),
  entite("0999.000.001", "Charpentes fictives", { courriel: "contact@charpentes.example" }),
  entite("0123.456.749", "Toitures de Meuse (répétée)"),
  entite("0555.000.002", "Indépendant en nom propre", { type: "1" }),
];

function reponse(o: { mode?: "demonstration" | "reel"; signataire?: typeof SIGNATAIRE | null; entreprises?: unknown[]; outil?: string } = {}) {
  const mode = o.mode ?? "demonstration";
  return emballer(o.signataire === undefined ? SIGNATAIRE : o.signataire, mode, { source: "BCE", total: 4, entreprises: o.entreprises ?? ENTREPRISES }, {
    service: "bce", outil: o.outil ?? "bce_rechercher", compte: mode === "reel" ? "registre/bce" : "registre/demo-bce", args: ARGS,
  }) as { texte: string; structuredContent: Record<string, unknown> };
}

/* ------------------------------------------------------------------ */
/* Banc : base en mémoire complétée des tables de prospection          */
/* ------------------------------------------------------------------ */

function banc(o: { modeEntreprise?: "demonstration" | "reel"; config?: Record<string, unknown>; poids?: Record<string, number>; clients?: Record<string, string>; marque?: Ligne; baseClients?: number } = {}) {
  const b = creerBanc({ modeEntreprise: o.modeEntreprise ?? "demonstration", config: { passerelleClesPubliques: [CLES.publiqueBase64], ...o.config } });
  const t = { prospects: [] as Ligne[], empreintes: [] as Ligne[], oppositions: [] as Ligne[], scores: [] as Ligne[], bases: new Map<string, Ligne[]>() };
  const appelsListe: number[] = [];
  const copie = <T>(v: T): T => structuredClone(v);
  const ext: Record<string, unknown> = {
    prospectsParIdentifiants: async (c: string, ids: Array<{ type: string; valeur: string }>) =>
      copie(t.prospects.filter((p) => p.companyId === c && ids.some((i) => i.type === p.identifiant.type && i.valeur === p.identifiant.valeur))),
    // Comme la vraie base : un prospect à la corbeille (`corbeille_le`) n'est servi que sur demande explicite.
    lireProspect: async (c: string, id: string, opt: { corbeille?: boolean } = {}) =>
      copie(t.prospects.find((p) => p.companyId === c && p.id === id && (opt.corbeille === true || p.corbeille_le == null)) ?? null),
    empreintesProspectsEnBase: async (c: string, v: string[]) => t.empreintes.filter((e) => e.companyId === c && v.includes(e.valeur)).map((e) => ({ prospectId: e.prospectId, type: e.type, valeur: e.valeur })),
    oppositionsPour: async (c: string, v: string[]) => t.oppositions.filter((x) => x.companyId === c && v.includes(x.empreinte)).map((x) => ({ type: x.type, valeur: x.empreinte, canal: x.canal })),
    clientsActuelsPour: async () => [],
    marques: async () => (o.marque ? [copie(o.marque)] : []),
    etatBaseClients: async () => ({ dernierImport: null, clients: o.baseClients ?? 0, actifs: o.baseClients ?? 0 }),
    dncmPour: async () => null,
    clientExiste: async () => false,
    clientParEmpreinte: async (_c: string, type: string, v: string) => (type === "identifiant_client" ? (o.clients?.[v] ?? null) : null),
    poidsScoreCourant: async () => (o.poids ? { version: 1, poids: o.poids } : null),
    referentielProspection: async () => ({ renvoi: null, versionMarque: null }),
    insererProspect: async (p: Ligne) => {
      if (t.prospects.some((x) => x.companyId === p.companyId && x.identifiant.type === p.identifiant.type && x.identifiant.valeur === p.identifiant.valeur)) throw new Error("violation de prospects_identifiant_uidx");
      const { empreintes: _e, score: _s, basesLegales: _b, ...ligne } = copie(p);
      t.prospects.push({ ...ligne, creeLe: p.creeLe ?? b.horloge(), modifieLe: p.modifieLe ?? b.horloge() });
    },
    majProspect: async (c: string, id: string, champs: Ligne) => {
      const p = t.prospects.find((x) => x.companyId === c && x.id === id);
      if (p) Object.assign(p, copie(champs), { modifieLe: b.horloge() });
      return p ? 1 : 0;
    },
    exclureProspect: async (c: string, id: string, motifs: unknown[]) => {
      const p = t.prospects.find((x) => x.companyId === c && x.id === id);
      if (p) Object.assign(p, { statut: "exclu", motifsExclusion: copie(motifs), modifieLe: b.horloge() });
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
      bases: new Map(ids.filter((id) => t.bases.has(id)).map((id) => [id, copie(t.bases.get(id)!)])),
    }),
    listerProspects: async (c: string, f: Ligne) => {
      appelsListe.push(f.parPage);
      const toutes = t.prospects.filter((p) => p.companyId === c && (!f.statuts || f.statuts.includes(p.statut)) && (!f.cibles || f.cibles.includes(p.cible)));
      return { total: toutes.length, lignes: copie(toutes.slice((f.page - 1) * f.parPage, f.page * f.parPage)) };
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
  };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
  async function appeler(routeKey: string, o2: { params?: Record<string, string>; query?: Record<string, string | string[]>; body?: unknown; companyId?: string; agent?: boolean }) {
    return aiguillage.traiterRequeteApi({
      routeKey, method: "POST", path: "/x", params: o2.params ?? {}, query: o2.query ?? {}, body: o2.body,
      actor: o2.agent === false ? { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null } : { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: "run-1" },
      companyId: o2.companyId ?? SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const deposer = (corps: unknown, companyId = SOC) => appeler("tache.prospects.deposer", { params: { issueId: BRIEF }, body: corps, companyId });
  const opposer = (corps: Ligne, companyId = SOC) => appeler("oppositions.ajouter", { body: { companyId, ...corps }, companyId, agent: false });
  return { ...b, tp: t, appelsListe, appeler, deposer, opposer };
}

const depotBce = (r = reponse()) => ({ service: "bce", outil: "bce_rechercher", reponse: r, arguments: ARGS });

const depotOsm = (commerce: Ligne) => ({
  service: "osm", outil: "osm_commerces", arguments: ARGS,
  reponse: emballer(SIGNATAIRE, "demonstration", { source: "OpenStreetMap", commerces: [commerce] }, { service: "osm", outil: "osm_commerces", compte: "registre/demo-osm", args: ARGS }) as { texte: string; structuredContent: Record<string, unknown> },
});
const CABINET = { id: "n43", nom: "Centre de Santé Intégrée", adresse: { code_postal: "4000", commune: "Liège" } };

/* ------------------------------------------------------------------ */
/* Dépôt signé                                                         */
/* ------------------------------------------------------------------ */

describe("tache.prospects.deposer", () => {
  it("lieu OSM : la catégorie (clé, valeur) est stockée sur la source ; un re-dépôt complète un lieu déjà connu sans catégorie", async () => {
    const f = banc();
    const premier = await f.deposer(depotOsm(CABINET));
    expect(premier.status).toBe(201);
    const ancien = Prospect.parse((premier.body.prospects as unknown[])[0]);
    expect(ancien.sources[0]!.categorieOsm).toBeUndefined();
    const second = await f.deposer(depotOsm({ ...CABINET, cle: "amenity", valeur: "clinic" }));
    expect(second.body).toMatchObject({ crees: 0, misAJour: 1 });
    const maj = Prospect.parse((second.body.prospects as unknown[])[0]);
    expect(maj.id).toBe(ancien.id);
    expect(maj.sources.some((s) => s.service === "osm" && s.categorieOsm?.cle === "amenity" && s.categorieOsm.valeur === "clinic")).toBe(true);
    const neuf = await banc().deposer(depotOsm({ ...CABINET, cle: "amenity", valeur: "dentist" }));
    expect(Prospect.parse((neuf.body.prospects as unknown[])[0]).sources[0]!.categorieOsm).toEqual({ cle: "amenity", valeur: "dentist" });
  });

  it("dépôt signé accepté : prospects créés, exclusions appliquées, personne physique BCE écartée, doublon de la réponse fusionné", async () => {
    const f = banc();
    const r = await f.deposer(depotBce());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ mode: "demonstration", modeCampagne: "demonstration", crees: 2, misAJour: 0, personnesPhysiquesEcartees: 1 });
    const prospects = (r.body.prospects as unknown[]).map((p) => Prospect.parse(p));
    const valide = prospects.find((p) => p.numeroBce === "0123.456.749")!;
    const fictif = prospects.find((p) => p.numeroBce === "0999.000.001")!;
    expect(valide).toMatchObject({ statut: "nouveau", motifsExclusion: [], mode: "demonstration", cible: "entreprise", forme: "personne_morale", denomination: "Toitures de Meuse" });
    expect(valide.zone).toMatchObject({ codePostal: "4000", commune: "Liège", region: "Wallonie" });
    expect(valide.sources[0]).toMatchObject({ type: "depot_signe", service: "bce", outil: "bce_rechercher", sourceId: r.body.sourceId });
    // P9b : numéro BCE de démonstration (modulo 97 volontairement faux) admis pour une réponse signée en
    // démonstration ; en réel, il reste exclu (tests/prospection-export.spec.ts).
    expect(fictif.statut).toBe("nouveau");
    expect(fictif.motifsExclusion).toEqual([]);
    expect(f.tp.prospects).toHaveLength(2);
    // Source de la tâche : connexion signée, sans la réponse brute.
    expect(f.t.sources).toHaveLength(1);
    expect(f.t.sources[0]).toMatchObject({ provenance: "connexion", mode: "demonstration", url: "connexion://bce/bce_rechercher" });
    expect(f.t.journal.map((j) => j.type)).toEqual(["prospects.deposes"]);
  });

  it("aucune coordonnée en clair dans ce qui est stocké (prospects, empreintes, source, journal) ; déchiffrables avec la clé", async () => {
    const f = banc();
    const r = await f.deposer(depotBce());
    expect(r.status).toBe(201);
    const stocke = JSON.stringify({ prospects: f.tp.prospects, empreintes: f.tp.empreintes, sources: f.t.sources, journal: f.t.journal });
    for (const clair of ["info@toitures-meuse.example", "contact@charpentes.example", "+32 4 000 11 22", "+3240001122", "toitures-meuse"]) expect(stocke).not.toContain(clair);
    const valide = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!;
    const courriel = valide.coordonnees.find((c: Ligne) => c.canal === "courriel");
    expect(courriel.valeur).toMatch(/^chv1\./u);
    expect(courriel.nature).toBe("impersonnelle");
    expect(dechiffrer(courriel.valeur, clesDemonstration(SOC).chiffrement)).toBe("info@toitures-meuse.example");
    expect(valide.nomChiffre).toBeNull();
  });

  it("dépôt non signé, signé par une autre clé ou modifié après signature : refusé, rien n'est créé", async () => {
    const modifiee = reponse();
    (modifiee.structuredContent.entreprises as Ligne[])[0]!.denominations[0].Denomination = "Autre nom";
    const cas: Array<[string, unknown]> = [
      ["non signé (démonstration)", depotBce(reponse({ signataire: null }))],
      ["autre clé (démonstration)", depotBce(reponse({ signataire: AUTRE }))],
      ["autre clé (réel)", depotBce(reponse({ mode: "reel", signataire: AUTRE }))],
      ["modifié", { ...depotBce(), reponse: { structuredContent: modifiee.structuredContent } }],
      ["autre outil déclaré", { ...depotBce(), outil: "bce_entreprise" }],
      ["arguments d'un autre appel", { ...depotBce(), arguments: { nace: ["10"] } }],
    ];
    for (const [nom, corps] of cas) {
      const f = banc();
      const r = await f.deposer(corps);
      expect(r.status, nom).toBe(400);
      expect(String(r.body.erreur), nom).toMatch(/non signée par la passerelle/u);
      expect(f.tp.prospects, nom).toEqual([]);
      expect(f.t.sources, nom).toEqual([]);
      expect(f.t.journal.map((j) => j.type), nom).toEqual(["prospects.refuses"]);
    }
    // Sans clé publique de la passerelle configurée : aucun dépôt possible.
    const sansCle = banc({ config: { passerelleClesPubliques: [] } });
    const r = await sansCle.deposer(depotBce());
    expect(r.status).toBe(400);
    expect(String(r.body.erreur)).toMatch(/Aucune clé publique de la passerelle/u);
  });

  it("mode déduit de la réponse signée, jamais du corps : un champ « mode » est refusé", async () => {
    const f = banc();
    const r = await f.deposer({ ...depotBce(), mode: "reel" });
    expect(r.status).toBe(400);
    expect(f.tp.prospects).toEqual([]);
  });

  it("entreprise réelle sans clés de données configurées : refus explicite ; clés identiques refusées ; clés distinctes acceptées", async () => {
    const reel = banc({ modeEntreprise: "reel" });
    const r = await reel.deposer(depotBce(reponse({ mode: "reel" })));
    expect(r.status).toBe(403);
    expect(String(r.body.erreur)).toMatch(/Mode réel : aucune clé de chiffrement/u);
    expect(reel.tp.prospects).toEqual([]);

    const refs = { donneesCleChiffrement: { type: "secret_ref", secretId: "a" }, donneesCleHmac: { type: "secret_ref", secretId: "b" } };
    const identiques = banc({ modeEntreprise: "reel", config: refs });
    (identiques.ctx as Ligne).secrets = { resolve: async () => Buffer.alloc(32, 7).toString("base64") };
    expect((await identiques.deposer(depotBce(reponse({ mode: "reel" })))).status).toBe(403);

    const distinctes = banc({ modeEntreprise: "reel", config: refs });
    const cleC = Buffer.alloc(32, 1);
    (distinctes.ctx as Ligne).secrets = { resolve: async (_r: unknown, o: { configPath: string }) => (o.configPath === "donneesCleChiffrement" ? cleC.toString("base64") : Buffer.alloc(32, 2).toString("hex")) };
    const ok = await distinctes.deposer(depotBce(reponse({ mode: "reel" })));
    expect(ok.status).toBe(201);
    expect(ok.body.mode).toBe("reel");
    const courriel = distinctes.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!.coordonnees[0];
    expect(dechiffrer(courriel.valeur, cleC)).toBe("info@toitures-meuse.example");
  });

  it("donnée de démonstration dans une entreprise réelle : enregistrée exclue (donnee_demonstration_campagne_reelle) avec les clés du coffre", async () => {
    const refs = { donneesCleChiffrement: { type: "secret_ref", secretId: "a" }, donneesCleHmac: { type: "secret_ref", secretId: "b" } };
    const f = banc({ modeEntreprise: "reel", config: refs });
    (f.ctx as Ligne).secrets = { resolve: async (_r: unknown, o: { configPath: string }) => Buffer.alloc(32, o.configPath === "donneesCleChiffrement" ? 1 : 2).toString("base64") };
    const r = await f.deposer(depotBce());
    expect(r.status).toBe(201);
    expect(r.body.mode).toBe("demonstration");
    for (const p of r.body.prospects as Prospect[]) expect(p.motifsExclusion.map((m) => m.motif)).toContain("donnee_demonstration_campagne_reelle");
  });

  it("dépôts successifs : les clés du coffre ne sont résolues qu'une fois par minute (débit limité par l'hôte)", async () => {
    const refs = { donneesCleChiffrement: { type: "secret_ref", secretId: "a" }, donneesCleHmac: { type: "secret_ref", secretId: "b" } };
    const f = banc({ modeEntreprise: "reel", config: refs });
    let appels = 0;
    (f.ctx as Ligne).secrets = { resolve: async (_r: unknown, o: { configPath: string }) => { appels++; return Buffer.alloc(32, o.configPath === "donneesCleChiffrement" ? 1 : 2).toString("base64"); } };
    for (let i = 0; i < 3; i++) expect((await f.deposer(depotBce())).status).toBe(201);
    expect(appels).toBe(2);
  });

  it("nouveau dépôt du même prospect : fusionné (pas de doublon), score expliqué calculé avec les poids du client", async () => {
    const f = banc({ poids: { source_registre_officiel: 40, courriel_impersonnel: 30, telephone_present: 10 } });
    await f.deposer(depotBce());
    const r = await f.deposer(depotBce());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 0, misAJour: 2 });
    expect(f.tp.prospects).toHaveLength(2);
    const valide = (r.body.prospects as Prospect[]).find((p) => p.numeroBce === "0123.456.749")!;
    expect(valide.sources).toHaveLength(2);
    expect(valide.score).toMatchObject({ valeur: 80, nature: "estimation", versionPoids: 1 });
    expect(valide.score!.criteres.map((c) => c.code)).toEqual(["source_registre_officiel", "courriel_impersonnel", "telephone_present"]);
  });

  it("redépôt : la fiche d'origine ne devient jamais le doublon d'un prospect arrivé après elle", async () => {
    const f = banc();
    const a = entite("0123.456.749", "Toitures de Meuse", { tel: "+32 4 000 11 22" });
    const b = entite("0234.567.873", "Même téléphone (démonstration)", { tel: "+32 4 000 11 22" });
    await f.deposer(depotBce(reponse({ entreprises: [a] })));
    await f.deposer(depotBce(reponse({ entreprises: [b] })));
    const statut = (n: string) => (f.tp.prospects as Array<{ numeroBce: string; statut: string; motifsExclusion: Array<{ motif: string }> }>).find((x) => x.numeroBce === n)!;
    expect(statut("0234.567.873")).toMatchObject({ statut: "exclu" });
    expect(statut("0234.567.873").motifsExclusion.map((m) => m.motif)).toEqual(["doublon"]);
    // Nouveau dépôt de la fiche d'origine : elle reste « nouveau », sans motif.
    await f.deposer(depotBce(reponse({ entreprises: [a] })));
    expect(statut("0123.456.749")).toMatchObject({ statut: "nouveau", motifsExclusion: [] });
  });

  it("accès croisé : la tâche d'une autre entreprise est introuvable", async () => {
    const f = banc();
    const r = await f.deposer(depotBce(), SOC2);
    expect(r.status).toBe(404);
    expect(f.tp.prospects).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Oppositions                                                         */
/* ------------------------------------------------------------------ */

describe("oppositions.ajouter", () => {
  it("opposition puis nouveau dépôt du même contact : prospect exclu (opposition_client) ; seule l'empreinte est stockée", async () => {
    const f = banc();
    const o = await f.opposer({ type: "courriel", valeur: "INFO@toitures-meuse.example ", origine: "demande_ecrite" });
    expect(o.status).toBe(201);
    const opposition = Opposition.parse(o.body);
    expect(opposition).toMatchObject({ type: "courriel", canal: "tous", origine: "demande_ecrite" });
    expect(JSON.stringify(f.tp.oppositions) + JSON.stringify(f.t.journal)).not.toContain("toitures-meuse");
    const r = await f.deposer(depotBce());
    const valide = (r.body.prospects as Prospect[]).find((p) => p.numeroBce === "0123.456.749")!;
    expect(valide.statut).toBe("exclu");
    expect(valide.motifsExclusion.map((m) => m.motif)).toEqual(["opposition_client"]);
  });

  it("opposition après le dépôt : le prospect déjà connu est exclu sans attendre ; la même opposition deux fois ne crée rien", async () => {
    const f = banc();
    await f.deposer(depotBce());
    const o = await f.opposer({ type: "numero_bce", valeur: "0123.456.749", origine: "telephone" });
    expect(o.status).toBe(201);
    expect(f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")).toMatchObject({ statut: "exclu", motifsExclusion: [expect.objectContaining({ motif: "opposition_client" })] });
    expect((await f.opposer({ type: "numero_bce", valeur: "0123456749", origine: "telephone" })).status).toBe(200);
    expect(f.tp.oppositions).toHaveLength(1);
  });

  it("réservée à un humain ; entreprise du corps différente de celle de la route : refusée", async () => {
    const f = banc();
    const agent = await f.appeler("oppositions.ajouter", { body: { companyId: SOC, type: "courriel", valeur: "a@b.example", origine: "humain" } });
    expect(agent.status).toBe(403);
    const croise = await f.appeler("oppositions.ajouter", { body: { companyId: SOC2, type: "courriel", valeur: "a@b.example", origine: "humain" }, agent: false });
    expect(croise.status).toBe(404);
    expect(f.tp.oppositions).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Liste, exclusion manuelle, particuliers                             */
/* ------------------------------------------------------------------ */

describe("prospects.lister et prospects.exclure", () => {
  it("liste filtrée de l'entreprise résolue, au format PageProspects ; une autre entreprise ne voit rien", async () => {
    const f = banc();
    await f.deposer(depotBce());
    const r = await f.appeler("prospects.lister", { query: { companyId: SOC, statuts: "nouveau", parPage: "10" } });
    expect(r.status).toBe(200);
    const page = PageProspects.parse(r.body);
    expect(page).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(page.prospects.map((p) => p.numeroBce).sort()).toEqual(["0123.456.749", "0999.000.001"]);
    expect(page.prospects.every((p) => p.empreintes.length > 0)).toBe(true);
    const exclus = await f.appeler("prospects.lister", { query: { companyId: SOC, statuts: "exclu", parPage: "10" } });
    expect(PageProspects.parse(exclus.body).total).toBe(0);
    const autre = await f.appeler("prospects.lister", { query: { companyId: SOC2 }, companyId: SOC2 });
    expect(PageProspects.parse(autre.body).total).toBe(0);
  });

  it("exclusion avec un motif connu, journalisée ; prospect d'une autre entreprise introuvable", async () => {
    const f = banc();
    const d = await f.deposer(depotBce());
    const id = (d.body.prospects as Prospect[]).find((p) => p.statut === "nouveau")!.id;
    const r = await f.appeler("prospects.exclure", { params: { prospectId: id }, body: { companyId: SOC, prospectId: id, motif: "hors_zone", detail: "Hors du périmètre du bureau" } });
    expect(r.status).toBe(200);
    expect(Prospect.parse(r.body)).toMatchObject({ statut: "exclu", motifsExclusion: [expect.objectContaining({ motif: "hors_zone" })] });
    expect(f.t.journal.map((j) => j.type)).toContain("prospect.exclu");
    const croise = await f.appeler("prospects.exclure", { params: { prospectId: id }, body: { companyId: SOC2, prospectId: id, motif: "hors_zone", detail: "xxx" }, companyId: SOC2 });
    expect(croise.status).toBe(404);
    const corpsAutre = await f.appeler("prospects.exclure", { params: { prospectId: id }, body: { companyId: SOC2, prospectId: id, motif: "hors_zone", detail: "xxx" } });
    expect(corpsAutre.status).toBe(404);
  });
});

describe("prospects.particuliers.enregistrer", () => {
  const consentement = {
    date: "2026-10-14T10:00:00+02:00", texteAccepte: "J'accepte d'être recontacté par courriel au sujet de ma demande de devis.", source: "https://exemple.invalid/devis",
    canauxAutorises: ["courriel"], responsableNomme: "Bureau de démonstration", reference: "soumission-0001",
  };
  const particulier = (o: Ligne = {}) => ({
    companyId: SOC, referentiel: { version: 1 }, zone: { codePostal: "4020", commune: "Liège", province: "Liège", region: "Wallonie" },
    coordonnees: { nom: "Marie Exemple (démonstration)", courriel: "marie@exemple.invalid", telephone: "+32 4 000 99 88", adresse: null },
    origine: "formulaire_entrant", consentements: [consentement], ...o,
  });

  it("enregistre un particulier fictif en démonstration : coordonnées chiffrées, origine et consentement gardés", async () => {
    const f = banc();
    const r = await f.appeler("prospects.particuliers.enregistrer", { body: particulier(), agent: false });
    expect(r.status).toBe(201);
    const p = Prospect.parse(r.body);
    expect(p).toMatchObject({ cible: "particulier", forme: "personne_physique", mode: "demonstration", denomination: null, numeroBce: null, statut: "nouveau" });
    expect(p.particulier).toMatchObject({ origine: "formulaire_entrant", consentements: [expect.objectContaining({ reference: "soumission-0001" })] });
    expect(dechiffrer(p.nomChiffre!, clesDemonstration(SOC).chiffrement)).toBe("Marie Exemple (démonstration)");
    expect(JSON.stringify(f.tp.prospects)).not.toMatch(/marie@exemple|Marie Exemple|000 99 88/u);
  });

  it("origine légale exigée, preuve de consentement exigée pour un formulaire, personne réelle refusée en démonstration, humain seulement", async () => {
    const f = banc();
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: particulier({ origine: undefined }), agent: false })).status).toBe(400);
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: particulier({ consentements: [] }), agent: false })).status).toBe(400);
    const reelle = particulier({ coordonnees: { nom: "Marie Vraie", courriel: "marie@courrier-reel.be", telephone: null, adresse: null } });
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: reelle, agent: false })).status).toBe(400);
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: particulier() })).status).toBe(403);
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: particulier({ companyId: SOC2 }), agent: false })).status).toBe(404);
    expect(f.tp.prospects).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Revue de sécurité M3 : aucun champ déclaré n'est cru                */
/* ------------------------------------------------------------------ */

describe("M3 : nature, empreintes, auteur et dates calculés par le serveur", () => {
  it("(1) nature et empreinte fournies dans la réponse (même signée) ou dans le corps : ignorées ou refusées, recalculées depuis la valeur", async () => {
    const f = banc();
    const piegee = entite("0123.456.749", "Toitures de Meuse", { courriel: "jean.dupont@toitures-meuse.example" });
    (piegee.contacts[0] as Ligne).nature = "impersonnelle";
    (piegee.contacts[0] as Ligne).empreinte = "0".repeat(64);
    (piegee as Ligne).empreintes = [{ type: "courriel", valeur: "1".repeat(64) }];
    const r = await f.deposer(depotBce(reponse({ entreprises: [piegee] })));
    expect(r.status).toBe(201);
    const stocke = f.tp.prospects[0]!;
    const cles = clesDemonstration(SOC);
    const attendue = empreinte("courriel", "jean.dupont@toitures-meuse.example", cles.hmac);
    expect(stocke.coordonnees[0]).toMatchObject({ canal: "courriel", nature: "nominative", empreinte: attendue });
    const valeurs = f.tp.empreintes.map((e) => e.valeur);
    expect(valeurs).toContain(attendue);
    expect(valeurs).toContain(empreinte("numero_bce", "0123456749", cles.hmac));
    expect(valeurs).not.toContain("0".repeat(64));
    expect(valeurs).not.toContain("1".repeat(64));
    // Corps d'un particulier ou d'une opposition qui déclare une empreinte, une nature ou un mode : refusé (schéma strict).
    const corpsParticulier = {
      companyId: SOC, referentiel: { version: 1 }, zone: { codePostal: "4020", commune: "Liège", province: null, region: null },
      coordonnees: { nom: "Marie Exemple (démonstration)", courriel: "marie@exemple.invalid", telephone: null, adresse: null, nature: "impersonnelle" },
      origine: "courrier_adresse",
    };
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: corpsParticulier, agent: false })).status).toBe(400);
    expect((await f.appeler("prospects.particuliers.enregistrer", { body: { ...corpsParticulier, coordonnees: { ...corpsParticulier.coordonnees, nature: undefined }, empreintes: [] }, agent: false })).status).toBe(400);
    expect((await f.opposer({ type: "courriel", valeur: "a@b.example", origine: "humain", empreinte: "0".repeat(64) })).status).toBe(400);
  });

  it("(2) auteur et dates de constat : acteur authentifié et horloge serveur, jamais le corps", async () => {
    const f = banc();
    const d = await f.deposer(depotBce());
    const id = (d.body.prospects as Prospect[]).find((p) => p.statut === "nouveau")!.id;
    const corps = { companyId: SOC, prospectId: id, motif: "hors_zone", detail: "Hors du périmètre du bureau" };
    for (const champ of [{ constateLe: "2020-01-01T00:00:00Z" }, { verifiePar: "pirate" }, { dncmVerifieLe: "2020-01-01T00:00:00Z" }]) {
      expect((await f.appeler("prospects.exclure", { params: { prospectId: id }, body: { ...corps, ...champ } })).status, Object.keys(champ)[0]).toBe(400);
    }
    const avant = Date.now();
    const r = await f.appeler("prospects.exclure", { params: { prospectId: id }, body: corps });
    const constate = Date.parse(Prospect.parse(r.body).motifsExclusion[0]!.constateLe);
    expect(constate).toBeGreaterThanOrEqual(avant - 1000);
    expect(constate).toBeLessThanOrEqual(Date.now() + 1000);
    expect(f.t.journal.find((j) => j.type === "prospect.exclu")).toMatchObject({ acteur: AGENT });
    expect((await f.opposer({ type: "courriel", valeur: "a@b.example", origine: "humain", enregistreePar: "pirate" })).status).toBe(400);
    const o = await f.opposer({ type: "courriel", valeur: "a@b.example", origine: "humain" });
    expect(Opposition.parse(o.body).enregistreePar).toBe(`humain:${HUMAIN}`);
  });
});

/* ------------------------------------------------------------------ */
/* Service b2c (particuliers de la passerelle)                         */
/* ------------------------------------------------------------------ */

const ARGS_B2C = { page: 1 };
const consentementB2c = (o: Ligne = {}) => ({
  date: "2026-08-03", texte: "J'accepte que l'assureur me recontacte au sujet de mon devis et de ses offres.", actif: true, retire_le: null,
  canaux: { email: true, telephone: false, sms: false }, canaux_a_l_origine: { email: true, telephone: false, sms: false }, ...o,
});
const personneB2c = (n: string) => ({ nom: `Personne ${n} (démonstration)`, courriel: `personne.${n}@exemple.invalid`, telephone: `+32 4 000 0${n} 11` });
const adresseB2c = { rue: "Rue de la Démonstration", numero: "3", boite: "", code_postal: "4020", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE" };
function reponseB2c(outil: string, donnees: Record<string, unknown>) {
  return emballer(SIGNATAIRE, "demonstration", { source: "B2C", client_demonstration: "Assureur de démonstration", ...donnees }, { service: "b2c", outil, compte: "registre/demo-b2c", args: ARGS_B2C }) as { texte: string; structuredContent: Record<string, unknown> };
}
const depotB2c = (outil: string, donnees: Record<string, unknown>) => ({ service: "b2c", outil, reponse: reponseB2c(outil, donnees), arguments: ARGS_B2C });

describe("service b2c", () => {
  const demandes = [
    { id: "dv1", statut: "complete", personne: personneB2c("1"), adresse: adresseB2c, consentement_marketing: consentementB2c(), client_existant: null },
    { id: "dv2", statut: "abandonne", personne: personneB2c("2"), adresse: adresseB2c, consentement_marketing: consentementB2c({ date: null, texte: null, actif: false }), client_existant: null },
    { id: "dv3", statut: "rendez_vous_pris", personne: personneB2c("3"), adresse: adresseB2c, consentement_marketing: consentementB2c({ retire_le: "2026-08-20", actif: false }), client_existant: null },
  ];

  it("b2c_demandes_devis : particuliers avec origine légale et consentement de la réponse ; sans consentement : non retenu", async () => {
    const f = banc();
    const r = await f.deposer(depotB2c("b2c_demandes_devis", { demandes }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 2, ignores: 1 });
    const ps = (r.body.prospects as unknown[]).map((p) => Prospect.parse(p));
    const p1 = ps.find((p) => p.particulier!.consentements[0]!.reference === "b2c_demandes_devis:dv1")!;
    expect(p1).toMatchObject({ cible: "particulier", forme: "personne_physique", mode: "demonstration", statut: "nouveau" });
    expect(p1.particulier).toMatchObject({ origine: "simulateur_devis", clientId: null });
    expect(p1.particulier!.consentements[0]).toMatchObject({ canauxAutorises: ["courriel"], responsableNomme: "Assureur de démonstration", retireLe: null });
    expect(p1.sources[0]).toMatchObject({ type: "depot_signe", service: "b2c", outil: "b2c_demandes_devis" });
    const p3 = ps.find((p) => p.particulier!.origine === "prise_rendez_vous")!;
    expect(p3.particulier!.consentements[0]!.retireLe).not.toBeNull();
    expect(JSON.stringify({ p: f.tp.prospects, e: f.tp.empreintes, s: f.t.sources, j: f.t.journal })).not.toMatch(/personne\.\d@exemple|Personne \d|000 0\d 11/u);
  });

  it("b2c_clients : client existant rapproché de la base de clients par empreinte ; hors base : non retenu", async () => {
    const CLIENT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const h = empreinte("identifiant_client", "cl1", clesDemonstration(SOC).hmac);
    const f = banc({ clients: { [h]: CLIENT } });
    const clients = [
      { id: "cl1", personne: personneB2c("4"), adresse: adresseB2c, consentement_marketing: consentementB2c() },
      { id: "cl2", personne: personneB2c("5"), adresse: adresseB2c, consentement_marketing: consentementB2c() },
    ];
    const r = await f.deposer(depotB2c("b2c_clients", { clients }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 1, clientsHorsBase: 1 });
    expect(Prospect.parse(r.body.prospects[0]).particulier).toMatchObject({ origine: "client_existant", clientId: CLIENT });
  });

  it("b2c_oppositions : oppositions enregistrées (empreintes seules), le particulier déjà connu est exclu", async () => {
    const f = banc();
    await f.deposer(depotB2c("b2c_demandes_devis", { demandes: [demandes[0]] }));
    const r = await f.deposer(depotB2c("b2c_oppositions", { oppositions: [{ id: "op1", personne: personneB2c("1"), adresse: adresseB2c, inscrit_le: "2026-09-01", canaux_opposes: ["telephone", "sms"] }] }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 0, oppositionsAjoutees: 4, exclusParOpposition: 1 });
    expect(f.tp.oppositions.map((o) => `${o.type}/${o.canal}/${o.origine}`).sort()).toEqual(["courriel/sms/import", "courriel/telephone/import", "telephone/sms/import", "telephone/telephone/import"]);
    expect(f.tp.prospects[0]).toMatchObject({ statut: "exclu", motifsExclusion: [expect.objectContaining({ motif: "opposition_client" })] });
    expect(JSON.stringify(f.tp.oppositions)).not.toContain("exemple.invalid");
  });

  it("b2c non signé : refusé", async () => {
    const f = banc();
    const corps = depotB2c("b2c_demandes_devis", { demandes });
    delete (corps.reponse.structuredContent._atelier as Ligne).signature;
    const r = await f.deposer({ ...corps, reponse: { structuredContent: corps.reponse.structuredContent } });
    expect(r.status).toBe(400);
    expect(f.tp.prospects).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Fonctions pures                                                     */
/* ------------------------------------------------------------------ */

describe("signaux de moment BCE", () => {
  const changements = (liste: Ligne[]) =>
    emballer(SIGNATAIRE, "demonstration", { source: "BCE", depuis: "2025-10-01", changements: liste }, { service: "bce", outil: "bce_changements", compte: "registre/demo-bce", args: ARGS });
  const depotChangements = (liste: Ligne[]) => ({ service: "bce", outil: "bce_changements", reponse: changements(liste), arguments: ARGS });

  it("la date de début d'une entreprise (StartDate, JJ-MM-AAAA) est conservée dans la source du prospect", async () => {
    const f = banc();
    const e = { ...entite("0123.456.749", "Toitures de Meuse"), StartDate: "10-02-2026" };
    const r = await f.deposer(depotBce(reponse({ entreprises: [e] })));
    expect(r.status).toBe(201);
    expect(f.tp.prospects[0]!.sources[0]).toMatchObject({ service: "bce", outil: "bce_rechercher", faits: [{ code: "debut_entreprise", date: "2026-02-10" }] });
  });

  it("sans StartDate, la source ne porte aucun fait", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    expect(f.tp.prospects[0]!.sources[0]).not.toHaveProperty("faits");
  });

  it("un dépôt bce_changements enrichit le prospect EXISTANT de même numéro BCE, sans créer de prospect, et ignore les autres numéros et les radiations", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    const r = await f.deposer(depotChangements([
      { date: "2026-08-20", type: "changement_adresse", EnterpriseNumber: "0123.456.749", de: "4000 Liège", vers: "4020 Liège" },
      { date: "2026-09-02", type: "nouvel_etablissement", EnterpriseNumber: "0123.456.749", etablissement: "2.000.000.001" },
      { date: "2026-09-03", type: "radiation", EnterpriseNumber: "0123.456.749" },
      { date: "2026-09-05", type: "creation", EnterpriseNumber: "0999.000.001" },
    ]));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 0, misAJour: 0, enrichisParChangements: 1 });
    expect(f.tp.prospects).toHaveLength(1);
    const sources = f.tp.prospects[0]!.sources as Ligne[];
    expect(sources).toHaveLength(2);
    expect(sources[1]).toMatchObject({ type: "depot_signe", service: "bce", outil: "bce_changements", sourceId: r.body.sourceId, faits: [{ code: "changement_adresse", date: "2026-08-20" }, { code: "nouvel_etablissement", date: "2026-09-02" }] });
    // Même dépôt répété : aucun fait nouveau, rien n'est ajouté.
    const encore = await f.deposer(depotChangements([{ date: "2026-08-20", type: "changement_adresse", EnterpriseNumber: "0123.456.749" }]));
    expect(encore.body.enrichisParChangements).toBe(0);
    expect((f.tp.prospects[0]!.sources as Ligne[])).toHaveLength(2);
  });
  it("un dépôt de démonstration n'enrichit pas un prospect RÉEL de même numéro BCE (changements), ni l'inverse", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    const depot = depotChangements([{ date: "2026-08-20", type: "changement_adresse", EnterpriseNumber: "0123.456.749" }]);
    f.tp.prospects[0]!.mode = "reel";
    const r = await f.deposer(depot);
    expect(r.body.enrichisParChangements).toBe(0);
    expect(f.tp.prospects[0]!.sources as Ligne[]).toHaveLength(1);
    f.tp.prospects[0]!.mode = "demonstration";
    expect((await f.deposer(depot)).body.enrichisParChangements).toBe(1);
  });

  it("un prospect à la corbeille n'est pas enrichi par un dépôt de changements BCE", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    f.tp.prospects[0]!.corbeille_le = "2026-10-15T10:00:00.000Z";
    const r = await f.deposer(depotChangements([{ date: "2026-08-20", type: "changement_adresse", EnterpriseNumber: "0123.456.749" }]));
    expect(r.body.enrichisParChangements).toBe(0);
    expect(f.tp.prospects[0]!.sources as Ligne[]).toHaveLength(1);
  });
});

describe("comptes annuels BNB", () => {
  const comptes = (numero: string, o: Ligne = {}) => emballer(SIGNATAIRE, "demonstration", {
    source: "BNB", EnterpriseNumber: numero, trouve: true, taille_deduite: "petite",
    references: [
      { ReferenceNumber: "2026-0001", ExerciseDates: { startDate: "2025-01-01", endDate: "2025-12-31" }, AccountingData: { Rubrics: [{ Code: "9087", Period: "N", Value: 6 }, { Code: "20/58", Period: "N", Value: 900000 }] } },
      { ReferenceNumber: "2025-0001", ExerciseDates: { startDate: "2024-01-01", endDate: "2024-12-31" }, AccountingData: { Rubrics: [{ Code: "9087", Period: "N", Value: 5 }] } },
    ],
    ...o,
  }, { service: "bnb", outil: "bnb_comptes", compte: "centrale/demo-bnb", args: ARGS });
  const depotComptes = (numero: string, o: Ligne = {}) => ({ service: "bnb", outil: "bnb_comptes", reponse: comptes(numero, o), arguments: ARGS });

  it("un dépôt bnb_comptes enrichit le prospect EXISTANT de même numéro BCE (taille), sans créer de prospect, sans doublon ; un numéro inconnu n'enrichit rien", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    const r = await f.deposer(depotComptes("0123.456.749"));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ crees: 0, misAJour: 0, enrichisParComptes: 1, enrichisParChangements: 0 });
    expect(f.tp.prospects).toHaveLength(1);
    const sources = f.tp.prospects[0]!.sources as Ligne[];
    expect(sources).toHaveLength(2);
    expect(sources[1]).toMatchObject({ type: "depot_signe", service: "bnb", outil: "bnb_comptes", sourceId: r.body.sourceId, taille: { exercice: 2025, effectifEtp: 6, categorie: "petite" } });
    // Même dépôt répété : rien de nouveau.
    const encore = await f.deposer(depotComptes("0123.456.749"));
    expect(encore.body.enrichisParComptes).toBe(0);
    expect(f.tp.prospects[0]!.sources as Ligne[]).toHaveLength(2);
    // Numéro inconnu : aucun enrichissement, aucune création.
    const inconnu = await f.deposer(depotComptes("0999.000.001"));
    expect(inconnu.body).toMatchObject({ crees: 0, enrichisParComptes: 0 });
    expect(f.tp.prospects).toHaveLength(1);
    // Réponse « non trouvée » : rien.
    const nonTrouve = await f.deposer(depotComptes("0123.456.749", { trouve: false, references: [] }));
    expect(nonTrouve.body.enrichisParComptes).toBe(0);
  });

  it("un dépôt bnb_comptes n'enrichit ni un prospect d'un autre mode ni un prospect à la corbeille", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    f.tp.prospects[0]!.mode = "reel";
    expect((await f.deposer(depotComptes("0123.456.749"))).body.enrichisParComptes).toBe(0);
    f.tp.prospects[0]!.mode = "demonstration";
    f.tp.prospects[0]!.corbeille_le = "2026-10-15T10:00:00.000Z";
    expect((await f.deposer(depotComptes("0123.456.749"))).body.enrichisParComptes).toBe(0);
    expect(f.tp.prospects[0]!.sources as Ligne[]).toHaveLength(1);
  });

  it("le prospect d'une AUTRE entreprise de même numéro BCE n'est jamais touché", async () => {
    const f = banc();
    await f.deposer(depotBce(reponse({ entreprises: [entite("0123.456.749", "Toitures de Meuse")] })));
    const autre = { ...structuredClone(f.tp.prospects[0]!), id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", companyId: SOC2 };
    f.tp.prospects.push(autre);
    const r = await f.deposer(depotComptes("0123.456.749"));
    expect(r.body.enrichisParComptes).toBe(1);
    expect(f.tp.prospects.find((p) => p.companyId === SOC2)!.sources as Ligne[]).toHaveLength(1);
    expect(f.tp.prospects.find((p) => p.companyId === SOC)!.sources as Ligne[]).toHaveLength(2);
  });

  it("extraireComptesBnb : dépôt le plus récent avec effectif, catégorie seulement si l'effectif est connu, rien si non trouvé", () => {
    const m = extraireComptesBnb([{ EnterpriseNumber: "0123.456.749", trouve: true, taille_deduite: "petite", references: [
      { ExerciseDates: { endDate: "2025-12-31" }, AccountingData: { Rubrics: [{ Code: "9087", Period: "N", Value: null }] } },
      { ExerciseDates: { endDate: "2024-12-31" }, AccountingData: { Rubrics: [{ Code: "9087", Period: "N", Value: 12.5 }] } },
    ] }]);
    expect(m.get("0123.456.749")).toEqual({ exercice: 2024, effectifEtp: 12.5, categorie: "petite" });
    const sansEffectif = extraireComptesBnb([{ EnterpriseNumber: "0123.456.749", trouve: true, taille_deduite: "inconnue", references: [{ ExerciseDates: { endDate: "2025-12-31" } }] }]);
    expect(sansEffectif.get("0123.456.749")).toEqual({ exercice: 2025, effectifEtp: null, categorie: null });
    expect(extraireComptesBnb([{ EnterpriseNumber: "0123.456.749", trouve: false, references: [] }]).size).toBe(0);
    expect(extraireComptesBnb([{ EnterpriseNumber: "pas un numéro", trouve: true, references: [{ ExerciseDates: { endDate: "2025-12-31" } }] }]).size).toBe(0);
  });
});

describe("extraction et zone", () => {
  it("extraireChangementsBce : types connus et dates valides seulement", () => {
    const m = extraireChangementsBce([{ changements: [
      { date: "2026-08-20", type: "changement_forme", EnterpriseNumber: "0123.456.749" },
      { date: "20-08-2026", type: "creation", EnterpriseNumber: "0123.456.749" },
      { date: "pas une date", type: "creation", EnterpriseNumber: "0123.456.749" },
      { date: "2026-08-20", type: "inconnu", EnterpriseNumber: "0123.456.749" },
      { date: "2026-08-20", type: "creation", EnterpriseNumber: "pas un numéro" },
    ] }]);
    expect(m.get("0123.456.749")).toEqual([{ code: "changement_forme", date: "2026-08-20" }, { code: "creation", date: "2026-08-20" }]);
    expect(m.size).toBe(1);
  });
  it("les outils sans prospect (comptes, changements, répartition) n'en donnent aucun", () => {
    expect(extraireProspects("bnb", "bnb_comptes", [{ EnterpriseNumber: "0123.456.749", references: [] }]).prospects).toEqual([]);
    expect(extraireProspects("bce", "bce_changements", [{ changements: [{ EnterpriseNumber: "0123.456.749" }] }]).prospects).toEqual([]);
  });
  it("FSMA et OSM : identifiant réglementaire, empreinte de nom et code postal", () => {
    const fsma = extraireProspects("fsma", "fsma_rechercher", [{ intermediaires: [{ numero_inscription: "123456", denomination: "Courtage X", numero_bce: "0123.456.749", adresse: { code_postal: "1000", commune: "Bruxelles" } }] }]).prospects[0]!;
    expect(fsma).toMatchObject({ cible: "partenaire", forme: "inconnue", identifiantReglementaire: "fsma:123456", numeroBce: "0123.456.749" });
    expect(fsma.zone.region).toBe("Bruxelles-Capitale");
    const osm = extraireProspects("osm", "osm_commerces", [{ commerces: [{ id: "n42", nom: "Boulangerie", adresse: { code_postal: "9000", commune: "Gand" }, telephone: "+32 9 000 00 00" }] }]).prospects[0]!;
    expect(osm).toMatchObject({ cleOsm: "n42", telephones: ["+32 9 000 00 00"], categorieOsm: null });
    const dentiste = extraireProspects("osm", "osm_commerces", [{ commerces: [{ id: "n43", nom: "Cabinet", cle: "amenity", valeur: "dentist", adresse: { code_postal: "4000", commune: "Liège" } }] }]).prospects[0]!;
    expect(dentiste.categorieOsm).toEqual({ cle: "amenity", valeur: "dentist" });
    expect(regionDuCodePostal("1348")).toBe("Wallonie");
    expect(regionDuCodePostal("8000")).toBe("Flandre");
  });
});

/* ------------------------------------------------------------------ */
/* Requêtes SQL réelles de base.ts : règles du validateur de l'hôte    */
/* ------------------------------------------------------------------ */

/** Copie des règles de `validatePluginRuntimeQuery` / `Execute` (paperclip/server/src/services/plugin-database.ts) et de `bindSql`. */
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

describe("SQL de prospection (base.ts réelle, règles de l'hôte)", () => {
  function dbControlee() {
    const ecrits: unknown[][] = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, true);
        return [];
      },
      async execute(sql: string, params: unknown[] = []) {
        controlerSql(sql, params, false);
        ecrits.push(params);
        return { rowCount: 1 };
      },
    };
    return { db, ecrits };
  }

  it("toutes les fonctions ajoutées passent les règles (une instruction, aucun mot de mutation en lecture, $n tous liés)", async () => {
    const { db } = dbControlee();
    const base = creerBase(db as unknown as PluginContext["db"]);
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await base.prospectsParIdentifiants(SOC, [{ type: "numero_bce", valeur: "0123.456.749" }]);
    await base.lireProspect(SOC, id);
    await base.empreintesProspectsEnBase(SOC, ["a".repeat(64)]);
    await base.oppositionsPour(SOC, ["a".repeat(64)]);
    await base.clientsActuelsPour(SOC, ["a".repeat(64)]);
    await base.dncmPour(SOC, ["a".repeat(64)]);
    await base.clientExiste(SOC, id);
    await base.poidsScoreCourant(SOC);
    await base.referentielProspection(SOC, CAMP);
    await base.reglesVentesCroisees(SOC);
    await base.clientsPourVentesCroisees(SOC);
    await base.detailsProspects(SOC, [id]);
    await base.listerProspects(SOC, { page: 1, parPage: 10 });
    await base.listerProspects(SOC, {
      campagneId: CAMP, cibles: ["entreprise"], nace: ["43.9"], codesPostaux: ["4000"], communes: ["Liège"], provinces: ["Liège"], regions: ["Wallonie"], statuts: ["nouveau"],
      entites: ["non-vie"], etablissements: ["liege"], segments: ["pme"], offres: ["rc"], origines: ["formulaire_entrant"], scoreMin: 20, page: 2, parPage: 10,
      zonesBureau: ["4000", "Liège"], source: "reelle", avecClientsActuels: false,
    });
    await base.listerProspects(SOC, { avecClientsActuels: true, source: "demonstration", page: 1, parPage: 10 });
    await base.prospectsAvecEmpreinte(SOC, "courriel", "a".repeat(64));
    await base.lireOpposition(SOC, "courriel", "a".repeat(64), "tous");
    await base.exclureProspect(SOC, id, []);
    await base.ajouterEmpreintesProspect(SOC, id, [{ type: "courriel", valeur: "a".repeat(64) }]);
    await base.insererScoreProspect({ id, companyId: SOC, prospectId: id, valeur: 10, criteres: [], versionPoids: 1, calculeLe: new Date().toISOString() });
    await base.insererOpposition({ id, companyId: SOC, type: "courriel", empreinte: "a".repeat(64), canal: "tous", origine: "humain", par: "humain:x", recueillieLe: null });
  });

  it("dépôt complet sur la base réelle : aucune coordonnée en clair dans les paramètres écrits", async () => {
    const { db, ecrits } = dbControlee();
    const ISSUE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const ctx = {
      db,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      issues: { get: async (id: string, c: string) => (id === ISSUE && c === SOC ? { id: ISSUE, companyId: SOC, projectId: null, status: "in_progress", title: "Prospection" } : null) },
      activity: { log: async () => undefined },
      config: { get: async () => ({ passerelleClesPubliques: [CLES.publiqueBase64] }) },
      events: { on() {} }, data: { register() {} }, actions: { register() {} },
    } as unknown as PluginContext;
    const r = (await creerAiguillage(ctx, creerServices(ctx)).traiterRequeteApi({
      routeKey: "tache.prospects.deposer", method: "POST", path: "/x", params: { issueId: ISSUE }, query: {}, body: depotBce(),
      actor: { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: null }, companyId: SOC, headers: {},
    } as never)) as { status: number; body: unknown };
    expect(r.status).toBe(201);
    const ecrit = JSON.stringify(ecrits);
    expect(ecrits.length).toBeGreaterThan(3);
    for (const clair of ["info@toitures-meuse.example", "contact@charpentes.example", "+32 4 000 11 22"]) expect(ecrit).not.toContain(clair);
  });
});

/* ------------------------------------------------------------------ */
/* Confiance de qualification : lecture, liste, filtre, critères manquants */
/* ------------------------------------------------------------------ */

describe("confiance de qualification (courtier fictif)", () => {
  // Cibles du courtier fictif : médecins (NACE 86.21x) à Liège ; les entreprises de test (NACE 43.910, toitures) sont donc hors segment.
  const marque = REFERENTIEL_COURTIER;
  const ciblesToitures = {
    ...marque,
    segments: [...marque.segments, { code: "couvreurs", libelle: "Couvreurs", type: "profession", nace: ["43.910"] }],
    ciblesProspection: [{ code: "couvreurs-liege", libelle: "Couvreurs de Liège", cible: "b2b", segments: ["couvreurs"], zones: { etablissements: ["bureau-liege"], communes: [], codesPostaux: [], provinces: [], regions: [] }, tailles: [], offres: [], entite: "non-vie" }],
  };

  it("lecture et liste : la confiance et ses critères sont servis, distincts du score de conversion", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 12, poids: { source_registre_officiel: 40, courriel_impersonnel: 30, telephone_present: 10 } });
    await f.deposer(depotBce());
    const r = await f.appeler("prospects.lister", { query: { companyId: SOC, statuts: "nouveau", parPage: "10" }, agent: false });
    const page = PageProspects.parse(r.body);
    const toitures = page.prospects.find((p) => p.numeroBce === "0123.456.749")!;
    // Actif (BCE), segment, zone, pas client (base importée) vérifiés ; joignable (aucune base légale dans le banc), taille, concordance non vérifiés.
    expect(toitures.confiance).toMatchObject({ valeur: 20 + 20 + 15 + 10, qualifie: false, plafonnee: false, seuil: 90 });
    expect(toitures.confiance!.criteres.map((c) => [c.code, c.statut])).toEqual([
      ["entreprise_active", "verifie"], ["segment_cible", "verifie"], ["zone_cible", "verifie"], ["joignable_legalement", "non_verifie"],
      ["pas_deja_client", "verifie"], ["taille_connue", "non_verifie"], ["sources_concordantes", "non_verifie"],
    ]);
    expect(toitures.confiance!.criteres[0]!.sourceId).toBe(toitures.sources[0]!.sourceId);
    // Le score de conversion garde sa nature et ses points : la confiance ne le modifie pas.
    expect(toitures.score).toMatchObject({ nature: "estimation", versionPoids: 1 });
    expect(toitures.score!.criteres.map((c) => c.code)).toEqual(["source_registre_officiel", "courriel_impersonnel", "telephone_present"]);
  });

  it("à chaque nouveau dépôt la confiance est recalculée, mais une 2e source du même service ne vaut pas concordance", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 3 });
    const premier = await f.deposer(depotBce());
    const avant = (premier.body.prospects as Prospect[]).find((p) => p.numeroBce === "0123.456.749")!.confiance!.valeur;
    // Même prospect, redéposé : une 2e source du MÊME service ne compte pas comme concordance (indépendance exigée).
    const second = await f.deposer(depotBce());
    const apres = (second.body.prospects as Prospect[]).find((p) => p.numeroBce === "0123.456.749")!;
    expect(apres.sources).toHaveLength(2);
    expect(apres.confiance!.valeur).toBe(avant);
    expect(apres.confiance!.criteres.find((c) => c.code === "sources_concordantes")!.statut).toBe("non_verifie");
  });

  it("filtre qualifiesSeulement : seuls les prospects à 90 % ou plus ; pagination sur les qualifiés", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 3 });
    await f.deposer(depotBce());
    const tous = PageProspects.parse((await f.appeler("prospects.lister", { query: { companyId: SOC, parPage: "10" }, agent: false })).body);
    expect(tous.total).toBeGreaterThan(0);
    expect(tous.prospects.every((p) => !p.confiance!.qualifie)).toBe(true);
    const q = PageProspects.parse((await f.appeler("prospects.lister", { query: { companyId: SOC, qualifiesSeulement: "true" }, agent: false })).body);
    expect(q).toMatchObject({ total: 0, pages: 0, prospects: [] });
    // Un prospect porté à 90 % (base légale + 2e source concordante) apparaît, l'autre non.
    const ligne = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!;
    ligne.sources = [...ligne.sources, { type: "depot_signe", sourceId: "c2222222-2222-4222-8222-222222222222", service: "osm", outil: "osm_commerces", url: null, collecteLe: ligne.creeLe }];
    f.tp.bases.set(ligne.id, [{
      cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
      preuve: { type: "source", reference: "BCE (démonstration)", date: ligne.creeLe }, information: { texteArt14: "Adresse trouvée à la BCE (démonstration).", moyenOpposition: "Lien de désinscription" },
      dncm_verifie_le: null, verifie_le: ligne.creeLe, verifie_par: "systeme",
    }]);
    const apres = PageProspects.parse((await f.appeler("prospects.lister", { query: { companyId: SOC, qualifiesSeulement: "true" }, agent: false })).body);
    expect(apres.total).toBe(1);
    expect(apres.prospects[0]).toMatchObject({ numeroBce: "0123.456.749", confiance: { valeur: 90, qualifie: true } });
    const hors = PageProspects.parse((await f.appeler("prospects.lister", { query: { companyId: SOC, qualifiesSeulement: "true", page: "2" }, agent: false })).body);
    expect(hors).toMatchObject({ total: 1, page: 2, prospects: [] });
  });

  it("carte avec qualifiesSeulement : un seul parcours par pages de 200, jamais la liste paginée de la carte", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 3 });
    await f.deposer(depotBce());
    const ligne = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!;
    ligne.sources = [...ligne.sources, { type: "depot_signe", sourceId: "c2222222-2222-4222-8222-222222222222", service: "osm", outil: "osm_commerces", url: null, collecteLe: ligne.creeLe }];
    f.tp.bases.set(ligne.id, [{
      cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
      preuve: { type: "source", reference: "BCE (démonstration)", date: ligne.creeLe }, information: { texteArt14: "Adresse trouvée à la BCE (démonstration).", moyenOpposition: "Lien de désinscription" },
      dncm_verifie_le: null, verifie_le: ligne.creeLe, verifie_par: "systeme",
    }]);
    f.appelsListe.length = 0;
    const r = await f.appeler("prospects.carte", { query: { companyId: SOC, qualifiesSeulement: "true" }, agent: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1, tronque: false });
    // Un seul passage de 200 (moins de 200 lignes : un seul appel) ; la liste paginée de la carte (pages de 100) n'est pas utilisée.
    expect(f.appelsListe).toEqual([200]);
  });

  it("prospects.criteres-manquants : un agent lit les critères à enrichir et l'outil de la passerelle pour chacun", async () => {
    const f = banc({ marque: ciblesToitures });
    await f.deposer(depotBce());
    const id = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!.id;
    const r = await f.appeler("prospects.criteres-manquants", { params: { prospectId: id }, query: { companyId: SOC } });
    expect(r.status).toBe(200);
    const m = CriteresManquants.parse(r.body);
    expect(m).toMatchObject({ prospectId: id, qualifie: false, seuil: 90, confiance: 20 + 20 + 15, contraires: [] });
    const outils = Object.fromEntries(m.manquants.map((x) => [x.code, x.verifiePar.map((v) => v.outil)]));
    expect(outils).toEqual({ taille_connue: ["bnb_comptes"], joignable_legalement: [], pas_deja_client: [], sources_concordantes: ["osm_commerces"] });
    // Autre entreprise : introuvable ; prospect inconnu : introuvable.
    const autre = await f.appeler("prospects.criteres-manquants", { params: { prospectId: id }, query: { companyId: SOC2 }, companyId: SOC2 });
    expect(autre.status).toBe(404);
    const inconnu = await f.appeler("prospects.criteres-manquants", { params: { prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, query: { companyId: SOC } });
    expect(inconnu.status).toBe(404);
  });
  it("un prospect à la corbeille n'est servi par aucune route de lecture (404 compte-rendu, critères manquants, question)", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 12 });
    (f.ctx as unknown as { agents: { list: unknown } }).agents.list = async () => [{ id: "44444444-4444-4444-8444-444444444444", companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }];
    await f.deposer(depotBce());
    const prospect = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!;
    const id = prospect.id;
    expect((await f.appeler("prospects.compte-rendu", { params: { prospectId: id }, query: { companyId: SOC } })).status).toBe(200);
    prospect.corbeille_le = "2026-10-15T10:00:00.000Z";
    expect((await f.appeler("prospects.compte-rendu", { params: { prospectId: id }, query: { companyId: SOC } })).status).toBe(404);
    expect((await f.appeler("prospects.criteres-manquants", { params: { prospectId: id }, query: { companyId: SOC } })).status).toBe(404);
    expect((await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC, question: "Une question ?" }, agent: false })).status).toBe(404);
    // Restauré : de nouveau servi.
    delete prospect.corbeille_le;
    expect((await f.appeler("prospects.compte-rendu", { params: { prospectId: id }, query: { companyId: SOC } })).status).toBe(200);
  });
  it("prospects.compte-rendu : lecture déterministe d'un agent ; autre entreprise et prospect inconnu : 404", async () => {
    const f = banc({ marque: ciblesToitures, baseClients: 12 });
    await f.deposer(depotBce());
    const id = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!.id;
    const r = await f.appeler("prospects.compte-rendu", { params: { prospectId: id }, query: { companyId: SOC } });
    expect(r.status).toBe(200);
    const cr = CompteRenduProspect.parse(r.body);
    expect(cr).toMatchObject({ prospectId: id, nom: "Autre nom", confiance: { valeur: 20 + 20 + 15 + 10, qualifie: false } });
    expect(cr.pourquoi.verifies.map((v) => v.code)).toEqual(["entreprise_active", "segment_cible", "zone_cible", "pas_deja_client"]);
    expect(cr.pourquoi.verifies[0]).toMatchObject({ service: "bce" });
    expect(cr.pourquoi.nonVerifies.map((v) => v.code)).toEqual(["joignable_legalement", "taille_connue", "sources_concordantes"]);
    expect(cr.prochaineAction.libelle).toContain("Enrichir : bnb_comptes");
    expect(cr.etablissementProche).toMatchObject({ code: "bureau-liege", raison: "meme_code_postal" });
    expect(cr.markdown).toContain("## Compte rendu du lead : Autre nom");
    expect(cr.limites.join(" ")).toContain("Données de démonstration");
    // Les coordonnées ne sortent jamais.
    expect(JSON.stringify(cr)).not.toMatch(/@|\+32/u);
    expect((await f.appeler("prospects.compte-rendu", { params: { prospectId: id }, query: { companyId: SOC2 }, companyId: SOC2 })).status).toBe(404);
    expect((await f.appeler("prospects.compte-rendu", { params: { prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, query: { companyId: SOC } })).status).toBe(404);
  });

  describe("prospects.question", () => {
    const COORD_ID = "44444444-4444-4444-8444-444444444444";
    async function prepare() {
      const f = banc({ marque: ciblesToitures, baseClients: 12 });
      (f.ctx as unknown as { agents: { list: unknown } }).agents.list = async () => [{ id: COORD_ID, companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }];
      await f.deposer(depotBce());
      const id = f.tp.prospects.find((p) => p.numeroBce === "0123.456.749")!.id;
      return { f, id };
    }

    it("un humain crée une tâche assignée au Coordinateur avec la question puis le compte rendu ; journalisé", async () => {
      const { f, id } = await prepare();
      const r = await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC, question: "Pourquoi ce lead est-il à 55 % ?" }, agent: false });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ identifiant: expect.stringMatching(/^REV-/u), lien: expect.stringMatching(/^\/issues\/REV-/u) });
      const tache = f.issues.get(r.body.issueId)!;
      expect(tache).toMatchObject({ companyId: SOC, assigneeAgentId: COORD_ID, status: "todo" });
      expect(tache.title).toBe("Lead : Autre nom : Pourquoi ce lead est-il à 55 % ?");
      expect(tache.description.startsWith("Pourquoi ce lead est-il à 55 % ?\n")).toBe(true);
      expect(tache.description).toContain("Réponds dans la discussion");
      expect(tache.description).toContain("## Compte rendu du lead : Autre nom");
      expect(tache.description).toContain("Source : BCE");
      expect(tache.description).not.toMatch(/@|\+32/u);
      const j = f.t.journal.find((e) => e.type === "prospect.question")!;
      expect(j).toMatchObject({ entite: "prospect", entiteId: id, issueId: r.body.issueId, acteur: HUMAIN });
      expect(j.donnees).toEqual({ coordinateurId: COORD_ID, titre: tache.title, tailleQuestion: 32 });
    });

    it("refus 403 pour un agent, 404 pour un prospect d'une autre entreprise, 400 pour une question vide, 404 sans Coordinateur", async () => {
      const { f, id } = await prepare();
      const agent = await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC, question: "Une question ?" } });
      expect(agent.status).toBe(403);
      expect(f.issues.size).toBeLessThan(100);
      const autre = await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC2, question: "Une question ?" }, companyId: SOC2, agent: false });
      expect(autre.status).toBe(404);
      const vide = await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC, question: "  " }, agent: false });
      expect(vide.status).toBe(400);
      (f.ctx as unknown as { agents: { list: unknown } }).agents.list = async () => [];
      const sans = await f.appeler("prospects.question", { params: { prospectId: id }, body: { companyId: SOC, question: "Une question ?" }, agent: false });
      expect(sans.status).toBe(404);
      expect(f.t.journal.filter((e) => e.type === "prospect.question")).toHaveLength(0);
    });
  });
});
