/**
 * « Passage au réel » (route `realite.etat`, humain seulement) : état de chaque branchement lu dans ce qui existe,
 * synthèse des critères « non vérifiés » par branchement, refus des agents, cloisonnement par entreprise, un seul
 * passage sur les leads. Faux hôte et faux accès base en mémoire ; courtier fictif, aucune donnée réelle.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { RealiteEtat, ROUTES_API, type SourcesReelles } from "../src/contrats/index.js";
import { PROSPECT_B2B, REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { PAGES_MAX, routesRealite } from "../src/serveur/services-realite.js";
import { SOC } from "./outils-base.js";
import { stockMemoire } from "./outils-reglages-leads.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "user-jb", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: null, runId: "run-1" };
const T0 = new Date("2026-10-16T08:00:00.000Z");
const H = "2026-10-15T10:00:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SOURCES = (o: { passerelle?: SourcesReelles["passerelle"]; reelles?: string[] } = {}): SourcesReelles => ({
  passerelle: o.passerelle ?? "joignable",
  sources: (["bce", "bnb", "osm", "liens"] as const).map((cle) => ({ cle, nom: cle, reelle: (o.reelles ?? []).includes(cle), detail: `détail ${cle}`, verifieLe: H })),
});

/** Ligne de la base : le lead de l'exemple, sans ses bases légales (elles viennent de `detailsProspects`). */
const ligne = (n: number, companyId: string, o: Ligne = {}): Ligne => {
  const { empreintes: _e, score: _s, basesLegales: _b, ...reste } = structuredClone(PROSPECT_B2B) as Ligne;
  return { ...reste, id: id(n), companyId, statut: "nouveau", ...o };
};
/** Base légale « joignable » d'un lead, sous la forme d'une ligne de la table `bases_legales`. */
const baseLegale = (prospectId: string): Ligne => {
  const b = structuredClone(PROSPECT_B2B.basesLegales[0]) as Ligne;
  return { prospect_id: prospectId, cible: b.cible, forme: b.forme, canal: b.canal, base: b.base, nature_adresse: b.natureAdresse, preuve: b.preuve, information: b.information, dncm_verifie_le: null, verifie_le: H, verifie_par: "systeme" };
};

interface Options {
  prospects?: Ligne[];
  /** Leads dont la base légale est enregistrée. */
  avecBase?: string[];
  etablissements?: Array<{ segmentsSuivis: string[] }> | null;
  /** Critères de qualification désactivés dans les réglages de l'entreprise. */
  inactifs?: string[];
  import?: { mode: string } | null;
  clients?: number;
  config?: Ligne | "erreur";
  sources?: SourcesReelles;
}

function faux(o: Options = {}) {
  const prospects = o.prospects ?? [ligne(1, SOC), ligne(2, SOC)];
  const avecBase = new Set(o.avecBase ?? [id(1)]);
  const compteurs = { liste: 0, details: 0, marques: 0, config: [] as string[] };
  const marque = o.etablissements === null ? undefined : { ...structuredClone(REFERENTIEL_COURTIER), etablissements: o.etablissements ?? REFERENTIEL_COURTIER.etablissements };
  const base = {
    marques: async () => (compteurs.marques++, marque ? [marque] : []),
    etatBaseClients: async () => ({
      dernierImport: o.import === null ? null : { id: id(900), nomFichier: "clients.csv", format: "csv", importeLe: H, importePar: "x", purgeLe: H, finalite: "f", dureeConservationMois: 12, lignesRetenues: 3, lignesRejetees: 0, mode: (o.import ?? { mode: "demonstration" }).mode },
      clients: o.clients ?? 3,
      actifs: o.clients ?? 3,
    }),
    listerProspects: async (companyId: string, f: { page: number; parPage: number }) => {
      compteurs.liste++;
      const tous = prospects.filter((p) => p.companyId === companyId);
      return { total: tous.length, lignes: tous.slice((f.page - 1) * f.parPage, f.page * f.parPage) };
    },
    detailsProspects: async (_c: string, ids: readonly string[]) => {
      compteurs.details++;
      return { empreintes: new Map(), scores: new Map(), bases: new Map(ids.filter((i) => avecBase.has(i)).map((i) => [i, [baseLegale(i)]])) };
    },
  } as unknown as BaseAtelier;
  const ctx = {
    config: {
      get: async (c: string) => {
        compteurs.config.push(c);
        if (o.config === "erreur") throw new Error("hôte indisponible");
        return o.config ?? {};
      },
    },
  } as unknown as PluginContext;
  const memoire = stockMemoire();
  if (o.inactifs) memoire.reglages.push({ companyId: SOC, version: 1, criteres: o.inactifs.map((code) => ({ code, actif: false, poids: 15 })) as never, seuil: 90, personnalises: [], decidePar: "test", decideLe: H });
  const routes = routesRealite({ ctx, base, stock: memoire.stock, sourcesReelles: async () => o.sources ?? SOURCES(), maintenant: () => T0 });
  const appeler = (r: Partial<RequeteRoute> = {}) => routes["realite.etat"]!({ cle: "realite.etat", params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const lire = async (r: Partial<RequeteRoute> = {}) => RealiteEtat.parse((await appeler(r)).corps);
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { appeler, lire, refus, compteurs };
}

const branchement = (e: RealiteEtat, cle: string) => e.branchements.find((b) => b.cle === cle)!;

describe("realite.etat : déclaration et droits", () => {
  it("route GET /realite, entreprise lue dans la requête, réservée à la session humaine (auth board)", () => {
    expect(ROUTES_API.find((r) => r.cle === "realite.etat")).toMatchObject({ methode: "GET", chemin: "/realite", auth: "board", resolution: { from: "query", key: "companyId" } });
  });

  it("un agent reçoit 403 et rien n'est lu", async () => {
    const f = faux();
    const e = await f.refus(f.appeler({ acteur: AGENT }));
    expect(e?.code).toBe("elevation_refusee");
    expect(e?.statut).toBe(403);
    expect(f.compteurs).toMatchObject({ liste: 0, details: 0, marques: 0, config: [] });
  });
});

describe("realite.etat : état de chaque branchement", () => {
  it("renvoie les neuf branchements du serveur dans l'ordre, au contrat", async () => {
    const e = await faux().lire();
    expect(e.branchements.map((b) => b.cle)).toEqual(["bce", "bnb", "osm", "base_clients", "consentement", "bureaux_segments", "voix", "moniteur_belge", "ne_m_appelez_plus"]);
    expect(e.companyId).toBe(SOC);
    expect(e.verifieLe).toBe(T0.toISOString());
  });

  it("BCE, Banque nationale, OpenStreetMap : lus sur la passerelle, jamais supposés réels", async () => {
    // Rien de réel : BCE et BNB attendent un accès officiel, OpenStreetMap tourne en démonstration.
    const demo = await faux({ sources: SOURCES() }).lire();
    expect(branchement(demo, "bce")).toMatchObject({ etat: "en_attente_acces", preuve: "mesure", acteur: "acces_officiel", detail: "détail bce" });
    expect(branchement(demo, "bnb")).toMatchObject({ etat: "en_attente_acces", acteur: "acces_officiel" });
    expect(branchement(demo, "osm")).toMatchObject({ etat: "demonstration", acteur: "nous" });
    // Les trois réels : seulement quand la passerelle le dit.
    const reel = await faux({ sources: SOURCES({ reelles: ["bce", "bnb", "osm"] }) }).lire();
    for (const cle of ["bce", "bnb", "osm"]) expect(branchement(reel, cle).etat, cle).toBe("reel");
    // Un seul réel : les autres ne suivent pas.
    const un = await faux({ sources: SOURCES({ reelles: ["bce"] }) }).lire();
    expect(branchement(un, "bce").etat).toBe("reel");
    expect(branchement(un, "bnb").etat).toBe("en_attente_acces");
  });

  it("passerelle injoignable ou non configurée : « non branché », sans preuve, avec le motif", async () => {
    for (const passerelle of ["injoignable", "non_configuree"] as const) {
      const e = await faux({ sources: SOURCES({ passerelle, reelles: ["bce"] }) }).lire();
      for (const cle of ["bce", "bnb", "osm"]) expect(branchement(e, cle), `${passerelle} ${cle}`).toMatchObject({ etat: "non_branche", preuve: "aucune" });
    }
  });

  it("base clients : aucun import = à fournir par le client ; démonstration ; réel", async () => {
    expect(branchement(await faux({ import: null, clients: 0 }).lire(), "base_clients")).toMatchObject({ etat: "a_fournir_client", acteur: "client" });
    expect(branchement(await faux({ import: { mode: "demonstration" } }).lire(), "base_clients")).toMatchObject({ etat: "demonstration" });
    const reel = branchement(await faux({ import: { mode: "reel" } }).lire(), "base_clients");
    expect(reel).toMatchObject({ etat: "reel", preuve: "mesure" });
    expect(reel.detail).toContain("3 clients");
  });

  it("bureaux et segments : tous renseignés = réel ; un bureau sans segment ou aucune fiche = à fournir", async () => {
    const complet = await faux({ etablissements: [{ segmentsSuivis: ["medecins"] }, { segmentsSuivis: ["proprietaires"] }] }).lire();
    expect(branchement(complet, "bureaux_segments").etat).toBe("reel");
    const partiel = branchement(await faux({ etablissements: [{ segmentsSuivis: ["medecins"] }, { segmentsSuivis: [] }] }).lire(), "bureaux_segments");
    expect(partiel).toMatchObject({ etat: "a_fournir_client", acteur: "client" });
    expect(partiel.detail).toContain("1 bureau(x) sur 2");
    expect(branchement(await faux({ etablissements: [] }).lire(), "bureaux_segments").etat).toBe("a_fournir_client");
    expect(branchement(await faux({ etablissements: null }).lire(), "bureaux_segments").etat).toBe("a_fournir_client");
  });

  it("bases légales : un lead sans base légale vérifiée la rend « à fournir », tous vérifiés (leads réels) la rend « réel », aucun lead = non branché", async () => {
    const un = branchement(await faux({ avecBase: [id(1)] }).lire(), "consentement");
    expect(un).toMatchObject({ etat: "a_fournir_client", acteur: "client", leadsConcernes: 1 });
    expect(un.detail).toContain("1 lead(s)");
    const reels = [ligne(1, SOC, { mode: "reel" }), ligne(2, SOC, { mode: "reel" })];
    expect(branchement(await faux({ prospects: reels, avecBase: [id(1), id(2)] }).lire(), "consentement")).toMatchObject({ etat: "reel", leadsConcernes: 0 });
    expect(branchement(await faux({ prospects: [], avecBase: [] }).lire(), "consentement").etat).toBe("non_branche");
  });

  it("bases légales d'un lead de démonstration : jamais « réel », même vérifiées ; le détail dit combien sont de démonstration", async () => {
    const mixte = [ligne(1, SOC, { mode: "reel" }), ligne(2, SOC)];
    const b = branchement(await faux({ prospects: mixte, avecBase: [id(1), id(2)] }).lire(), "consentement");
    expect(b).toMatchObject({ etat: "demonstration", preuve: "mesure", leadsConcernes: 0 });
    expect(b.detail).toBe("Les 2 leads analysés ont une base légale vérifiée, mais 1 d'entre eux est un lead de démonstration : ce n'est pas une base légale réelle.");
  });

  it("critère « Joignable légalement » désactivé : « non mesurable », jamais « réel » ni « tous vérifiés » ; nombre de leads non calculable", async () => {
    const e = await faux({ inactifs: ["joignable_legalement"], prospects: [ligne(1, SOC, { mode: "reel" })], avecBase: [] }).lire();
    expect(branchement(e, "consentement")).toMatchObject({
      etat: "non_branche", preuve: "aucune", leadsConcernes: null,
      detail: "Non mesurable : le critère « Joignable légalement » est désactivé dans les réglages de qualification, aucune base légale n'est comptée.",
    });
    expect(e.synthese.map((s) => s.code)).not.toContain("joignable_legalement");
  });

  it("voix : la clé n'est que déclarée (jamais appelée) : « configuré, non vérifié », jamais « réel » ; absente ou configuration illisible = non branché", async () => {
    const declaree = branchement(await faux({ config: { openaiSecretRef: { type: "secret_ref", secretId: "s1" } } }).lire(), "voix");
    expect(declaree).toMatchObject({ etat: "configure_non_verifie", preuve: "declare", acteur: "nous" });
    expect(declaree.detail).toContain("non vérifiée");
    const absente = branchement(await faux({ config: {} }).lire(), "voix");
    expect(absente).toMatchObject({ etat: "non_branche", preuve: "mesure" });
    expect(absente.detail).toContain("voix_non_configuree");
    expect(branchement(await faux({ config: "erreur" }).lire(), "voix")).toMatchObject({ etat: "non_branche", preuve: "aucune" });
  });

  it("Moniteur belge et liste « Ne m'appelez plus » : non branchés, sources qui restent à brancher", async () => {
    const e = await faux({ config: { openaiSecretRef: { type: "secret_ref", secretId: "s1" } }, sources: SOURCES({ reelles: ["bce", "bnb", "osm"] }) }).lire();
    expect(branchement(e, "moniteur_belge")).toMatchObject({ etat: "non_branche", preuve: "aucune", acteur: "nous", leadsConcernes: null });
    expect(branchement(e, "ne_m_appelez_plus")).toMatchObject({ etat: "non_branche", preuve: "aucune", acteur: "acces_officiel", leadsConcernes: null });
    expect(branchement(e, "ne_m_appelez_plus").debloque.criteres.map((c) => c.code)).toEqual(["contact_public_permis", "joignable_legalement"]);
  });

  it("chaque branchement dit ce qu'il débloque : critères et fonctions", async () => {
    const e = await faux().lire();
    expect(branchement(e, "bce").debloque.criteres.map((c) => c.code)).toEqual(["entreprise_active", "segment_cible", "zone_cible", "assurance_obligatoire_metier", "installation_recente", "evenement_recent", "pas_concurrent"]);
    expect(branchement(e, "bnb").debloque.criteres.map((c) => c.code)).toEqual(["taille_connue", "emploie_personnel", "flotte_probable", "proprietaire_locaux", "sante_financiere"]);
    for (const b of e.branchements) expect(b.debloque.criteres.length + b.debloque.fonctions.length, b.cle).toBeGreaterThan(0);
  });
});

describe("realite.etat : synthèse par critère", () => {
  it("compte les leads « non vérifiés » par critère et nomme le branchement qui les débloquerait", async () => {
    const e = await faux({ prospects: [ligne(1, SOC), ligne(2, SOC), ligne(3, SOC)], avecBase: [id(1)] }).lire();
    expect(e.leads).toEqual({ analyses: 3, tronque: false, illisibles: 0 });
    const parCode = Object.fromEntries(e.synthese.map((s) => [s.code, s]));
    // Aucun des trois n'a de comptes annuels : la taille attend la Banque nationale.
    expect(parCode.taille_connue).toMatchObject({ leadsNonVerifies: 3, branchement: "bnb", etatBranchement: "en_attente_acces" });
    expect(parCode.taille_connue!.phrase).toBe("3 leads attendent les comptes réels de la Banque nationale pour connaître leur taille (effectif, chiffre d'affaires).");
    // Deux leads sur trois n'ont pas de base légale.
    expect(parCode.joignable_legalement).toMatchObject({ leadsNonVerifies: 2, branchement: "consentement" });
    expect(branchement(e, "consentement").leadsConcernes).toBe(2);
    // Tri : le critère le plus attendu d'abord.
    const n = e.synthese.map((s) => s.leadsNonVerifies);
    expect(n).toEqual([...n].sort((a, b) => b - a));
  });

  it("bureau spécialisé et contact publié : rattachés à leur vrai branchement, avec des phrases exactes (jamais « la fiche du client (offres confirmées) »)", async () => {
    const e = await faux({ prospects: [ligne(1, SOC), ligne(2, SOC)] }).lire();
    const parCode = Object.fromEntries(e.synthese.map((s) => [s.code, s]));
    expect(parCode.bureau_specialise_proche).toMatchObject({ branchement: "bureaux_segments", leadsNonVerifies: 2 });
    expect(parCode.bureau_specialise_proche!.phrase).toBe("2 leads attendent les segments suivis par bureau pour trouver un bureau spécialisé à proximité.");
    // Le contact publié n'est « non vérifié » que pour un lead dont seul le téléphone est publié : la phrase doit citer la liste d'opposition.
    const tel = [{ ...structuredClone(PROSPECT_B2B.coordonnees[0]!), canal: "telephone", nature: "inconnue" }];
    const f = await faux({ prospects: [ligne(1, SOC, { coordonnees: tel })] }).lire();
    const contact = f.synthese.find((s) => s.code === "contact_public_permis")!;
    expect(contact).toMatchObject({ branchement: "ne_m_appelez_plus", etatBranchement: "non_branche" });
    expect(contact.phrase).toBe("1 lead attend la liste « Ne m'appelez plus » pour établir qu'un contact professionnel publié est permis.");
    expect(branchement(f, "ne_m_appelez_plus").debloque.criteres.map((c) => c.code)).toEqual(["contact_public_permis", "joignable_legalement"]);
    expect(branchement(e, "bureaux_segments").debloque.criteres.map((c) => c.code)).toEqual(["bureau_specialise_proche"]);
  });

  it("bureaux et segments renseignés (réel) mais lead encore non vérifié : la phrase ne prétend pas qu'il reste à lancer une vérification de source", async () => {
    const e = await faux({ prospects: [ligne(1, SOC)], etablissements: [{ segmentsSuivis: ["medecins"] }] }).lire();
    const b = e.synthese.find((s) => s.code === "bureau_specialise_proche")!;
    expect(b.etatBranchement).toBe("reel");
    expect(b.phrase).toBe("1 lead reste non vérifié pour trouver un bureau spécialisé à proximité : les segments suivis sont renseignés, mais ce lead n'a pas pu être rapproché d'un bureau (segment, position ou distance non établis).");
  });

  it("une phrase au singulier, et « branché mais à lancer » quand la source est réelle", async () => {
    const e = await faux({ prospects: [ligne(1, SOC)], sources: SOURCES({ reelles: ["bnb"] }) }).lire();
    const taille = e.synthese.find((s) => s.code === "taille_connue")!;
    expect(taille.etatBranchement).toBe("reel");
    expect(taille.phrase).toBe("1 lead reste non vérifié pour connaître leur taille (effectif, chiffre d'affaires) : la source est branchée (les comptes réels de la Banque nationale), la vérification reste à lancer.");
  });

  it("un branchement compte chaque lead une seule fois, même avec plusieurs critères manquants", async () => {
    const e = await faux({ prospects: [ligne(1, SOC), ligne(2, SOC)] }).lire();
    const bce = branchement(e, "bce");
    const critBce = e.synthese.filter((s) => s.branchement === "bce");
    // Plusieurs critères du BCE manquent à chaque lead : la somme par critère dépasse le nombre de leads, le branchement non.
    expect(critBce.reduce((t, s) => t + s.leadsNonVerifies, 0)).toBeGreaterThan(2);
    expect(bce.leadsConcernes).toBe(2);
  });

  it("les leads exclus ou refusés ne sont pas comptés, un lead illisible est signalé", async () => {
    const e = await faux({ prospects: [ligne(1, SOC), ligne(2, SOC, { statut: "exclu", motifsExclusion: [{ motif: "client_actuel", detail: "Déjà client.", constateLe: H }] }), ligne(3, SOC, { statut: "refuse" }), ligne(4, SOC, { cible: "marsupilami" })] }).lire();
    expect(e.leads).toMatchObject({ analyses: 1, illisibles: 1 });
  });

  it("cloisonnement : les leads et la configuration d'une autre entreprise ne sont jamais lus", async () => {
    const f = faux({ prospects: [ligne(1, SOC), ligne(2, SOC2), ligne(3, SOC2), ligne(4, SOC2)] });
    expect((await f.lire({ companyId: SOC })).leads.analyses).toBe(1);
    expect((await f.lire({ companyId: SOC2 })).leads.analyses).toBe(3);
    expect((await f.lire({ companyId: id(555) })).leads.analyses).toBe(0);
    expect(f.compteurs.config).toEqual([SOC, SOC2, id(555)]);
  });

  it("un seul passage : une lecture des leads et un chargement de détails par page, aucune requête par lead", async () => {
    const f = faux({ prospects: Array.from({ length: 150 }, (_, i) => ligne(1000 + i, SOC)) });
    const e = await f.lire();
    expect(e.leads.analyses).toBe(150);
    expect(f.compteurs.liste).toBe(1);
    expect(f.compteurs.details).toBe(1);
  });

  it("au plafond de pages, le parcours s'arrête et le dit (nombres = minimums)", async () => {
    const f = faux({ prospects: Array.from({ length: PAGES_MAX * 200 + 1 }, (_, i) => ligne(10_000 + i, SOC)) });
    const e = await f.lire();
    expect(e.leads).toMatchObject({ tronque: true, analyses: PAGES_MAX * 200 });
    expect(f.compteurs.liste).toBe(PAGES_MAX);
  });
});
