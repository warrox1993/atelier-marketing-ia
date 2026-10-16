/**
 * Couverture de prospection calculée par la machine : liste des codes postaux à interroger, zones marquées
 * d'après les dépôts signés de la campagne, contrôle du livrable par la porte (zones manquantes, totaux).
 * Positions des bureaux : celles du référentiel généré (OpenStreetMap), jamais saisies à la main ici.
 */
import { describe, expect, it } from "vitest";
import { creerAiguillage } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { CODES_POSTAUX_BE, type LigneCodePostal } from "../src/serveur/codes-postaux-be.js";
import { calculerCouverture, controlerLivrableProspection, zonesAInterroger, type DepotCouverture } from "../src/serveur/couverture-prospection.js";
import { distanceKm } from "../src/serveur/geo.js";
import { evaluerPorte, type EntreesPorte } from "../src/serveur/porte.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, ISSUE, PRODUCTEUR, REV1, SOC, creerBanc } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ligne = (cp: string): LigneCodePostal => CODES_POSTAUX_BE.find((l) => l[0] === cp)!;
const bureauA = (cp: string, nom: string) => ({ nom, code: null, lat: ligne(cp)[1], lon: ligne(cp)[2] });
const LIEGE = bureauA("4000", "Bureau de Liège");
const AYWAILLE = bureauA("4920", "Bureau d'Aywaille");

/** Référentiel réduit pour la liste exacte (lignes copiées du référentiel généré). */
const MINI: LigneCodePostal[] = ["4000", "4041", "4460", "4920", "4171", "1000", "9000"].map(ligne);

let horloge = 0;
const depot = (outil: string, args: Record<string, unknown> | null, o: { total?: number; page?: number; pages?: number } = {}): DepotCouverture => ({
  issueId: ISSUE, outil, arguments: args, total: o.total ?? 0, page: o.page ?? 1, pages: o.pages ?? 1, creeLe: new Date(Date.UTC(2026, 9, 16, 8, 0, 0, ++horloge)).toISOString(),
});

describe("zones à interroger (calcul)", () => {
  it("2 bureaux et un rayon de 10 km : liste exacte des codes postaux, bureau le plus proche, triée", () => {
    const zones = zonesAInterroger([LIEGE, AYWAILLE], 10, MINI);
    expect(zones.map((z) => z.codePostal)).toEqual(["4000", "4041", "4171", "4460", "4920"]);
    expect(zones.find((z) => z.codePostal === "4171")).toMatchObject({ bureau: "Bureau d'Aywaille", communes: ["Comblain-au-Pont"] });
    expect(zones.find((z) => z.codePostal === "4041")!.bureau).toBe("Bureau de Liège");
    // Rayon plus court : 4171 (≈ 8,8 km d'Aywaille) sort de la liste.
    expect(zonesAInterroger([LIEGE, AYWAILLE], 5, MINI).map((z) => z.codePostal)).not.toContain("4171");
  });

  it("sur le référentiel complet : chaque code retenu est à moins de 10 km d'un bureau, aucun autre ne l'est", () => {
    const zones = zonesAInterroger([LIEGE, AYWAILLE], 10);
    const attendu = CODES_POSTAUX_BE.filter(([, lat, lon]) => [LIEGE, AYWAILLE].some((b) => distanceKm({ latitude: lat, longitude: lon }, { latitude: b.lat, longitude: b.lon }) <= 10)).map((l) => l[0]).sort();
    expect(zones.map((z) => z.codePostal)).toEqual(attendu);
    for (const cp of ["4041", "4460", "4920", "4171"]) expect(attendu).toContain(cp); // zones oubliées sur la mission relevée par l'opérateur
  });
});

describe("zones interrogées (dépôts de la campagne)", () => {
  it("marque une zone par code postal, par commune ou par province ; une requête aux pages incomplètes ne compte pas", () => {
    const c = calculerCouverture({
      bureaux: [LIEGE, AYWAILLE], rayonKm: 10, referentiel: MINI,
      depots: [
        depot("osm_commerces", { categories: ["sante"], codes_postaux: ["4000", "4041"] }, { total: 37 }),
        depot("osm_commerces", { categories: ["sante"], communes: ["Grace Hollogne"] }, { total: 2 }),
        depot("osm_commerces", { categories: ["sante"], codes_postaux: ["4920"], page: 1 }, { total: 127, page: 1, pages: 2 }),
        depot("bce_rechercher", { nace: ["86"], provinces: ["Liège"] }, { total: 80 }),
        depot("bce_rechercher", null), // dépôt sans arguments : ne prouve aucune zone
      ],
    });
    const z = Object.fromEntries(c.zones.map((x) => [x.codePostal, x.interrogee]));
    expect(z["4000"]).toEqual({ osm_commerces: true, bce_rechercher: true });
    expect(z["4041"]).toEqual({ osm_commerces: true, bce_rechercher: true });
    expect(z["4460"]).toEqual({ osm_commerces: true, bce_rechercher: true }); // commune « Grâce-Hollogne » sans accent ni tiret
    expect(z["4920"]!.osm_commerces).toBe(false); // page 2 sur 2 jamais déposée
    expect(z["4171"]!.osm_commerces).toBe(false);
    expect(c.outilsRequis).toEqual(["osm_commerces", "bce_rechercher"]);
    expect(c.manquantes.map((m) => [m.codePostal, m.outils])).toEqual([["4171", ["osm_commerces"]], ["4920", ["osm_commerces"]]]);
    expect(c.complete).toBe(false);
    expect(c.depotsSansArguments).toBe(1);
    expect(c.totaux.osm_commerces).toEqual({ requetes: 3, requetesIncompletes: 1, total: 166 });

    // La page 2 déposée complète la requête : 4920 devient interrogée.
    const suite = calculerCouverture({
      bureaux: [LIEGE, AYWAILLE], rayonKm: 10, referentiel: MINI,
      depots: [depot("osm_commerces", { codes_postaux: ["4920", "4171"], page: 1 }, { total: 30, pages: 2 }), depot("osm_commerces", { codes_postaux: ["4920", "4171"], page: 2 }, { total: 30, page: 2, pages: 2 }), depot("osm_commerces", { codes_postaux: ["4000", "4041", "4460"] }, { total: 12 })],
    });
    expect(suite.complete).toBe(true);
    expect(suite.totaux.osm_commerces).toEqual({ requetes: 2, requetesIncompletes: 0, total: 42 });
    expect(suite.phrases).toContain("Total OpenStreetMap : 42 résultats renvoyés par 2 requêtes distinctes (calcul machine).");
  });
});

describe("requête paginée sans nombre de pages", () => {
  const sansPages = (page: number | null, o: Partial<DepotCouverture> = {}): DepotCouverture => ({ ...depot("osm_commerces", { codes_postaux: ["4000"], ...(page === null ? {} : { page }) }, { total: 50 }), page, pages: null, ...o });
  const couvre = (depots: DepotCouverture[]) => calculerCouverture({ bureaux: [LIEGE], rayonKm: 3, referentiel: MINI, depots });

  it("page 1 déposée, pages inconnues : incomplète, la zone n'est pas couverte", () => {
    const c = couvre([sansPages(1)]);
    expect(c.requetes[0]).toMatchObject({ complete: false, pagesDeposees: [1] });
    expect(c.complete).toBe(false);
    expect(c.totaux.osm_commerces.requetesIncompletes).toBe(1);
  });
  it("pages déduites du total et de la taille de page : complète quand toutes sont déposées", () => {
    expect(couvre([sansPages(1, { taillePage: 25 })]).requetes[0]).toMatchObject({ complete: false, pagesAttendues: 2 });
    expect(couvre([sansPages(1, { taillePage: 25 }), sansPages(2, { taillePage: 25 })]).complete).toBe(true);
  });
  it("dernière page prouvée par une page plus courte que demandé : complète", () => {
    expect(couvre([sansPages(1, { taillePage: 25, total: null, renvoyes: 25 })]).complete).toBe(false);
    expect(couvre([sansPages(1, { taillePage: 25, total: null, renvoyes: 25 }), sansPages(2, { taillePage: 25, total: null, renvoyes: 10 })]).complete).toBe(true);
  });
  it("réponse sans pagination du tout (page et pages absentes, pas d'argument page) : une seule réponse suffit", () => {
    expect(couvre([sansPages(null)]).complete).toBe(true);
  });
});

describe("contrôle du livrable", () => {
  const complete = calculerCouverture({ bureaux: [LIEGE], rayonKm: 3, referentiel: MINI, depots: [depot("osm_commerces", { codes_postaux: ["4000"] }, { total: 165 })] });

  it("sommes fausses, total différent du total machine, nombre de codes postaux annoncé faux", () => {
    expect(complete.complete).toBe(true);
    const ecarts = controlerLivrableProspection(
      [
        "## Passe 1",
        "Établissements trouvés : 2 + 37 + 127 = 165.",
        "Total OpenStreetMap : 170 établissements.",
        "",
        "## Passe 2",
        "La passe 2 couvre 3 codes postaux :",
        "",
        "- 4000 Liège",
        "- 4041 Vottem",
        "",
        "Fin.",
      ].join("\n"),
      complete,
    );
    expect(ecarts.map((e) => e.code)).toEqual(["total_incoherent", "total_incoherent", "total_incoherent"]);
    expect(ecarts[0]!.message).toContain("le calcul donne 166");
    expect(ecarts[0]!.element).toBe("2 + 37 + 127 = 165");
    expect(ecarts[1]!.message).toContain("165");
    expect(ecarts[2]!.message).toContain("2 nommés");
  });

  it("phrase machine recopiée telle quelle puis tableau de prospects : acceptée ; une phrase falsifiée reste contrôlée", () => {
    const phrase = complete.phrases[0]!;
    const tableau = ["", "| Entreprise | CP |", "| --- | --- |", "| A | 4000 |", "| B | 4041 |"].join("\n");
    expect(controlerLivrableProspection(`${phrase}\n${tableau}`, complete)).toEqual([]);
    expect(controlerLivrableProspection(`- **${phrase}**\n${tableau}`, complete)).toEqual([]);
    // Nombre modifié : ce n'est plus la phrase de la route, le contrôle s'applique.
    const falsifiee = phrase.replace(/^Couverture \(calcul machine\) : \d+/u, "Couverture (calcul machine) : 36");
    expect(controlerLivrableProspection(`${falsifiee}\n${tableau}`, complete).map((e) => e.code)).toEqual(["total_incoherent"]);
  });

  describe("total annoncé avec un qualificatif avant les deux-points", () => {
    const avecBce = calculerCouverture({ bureaux: [LIEGE], rayonKm: 3, referentiel: MINI, depots: [depot("bce_rechercher", { codes_postaux: ["4000"] }, { total: 36 })] });
    it.each(["Total BCE (10 km) : 36", "Total BCE au 16/10/2026 : 36", "Total BCE : 36 résultats"])("« %s » accepté quand 36 est juste", (texte) => {
      expect(controlerLivrableProspection(texte, avecBce)).toEqual([]);
    });
    it.each(["Total BCE (10 km) : 37", "Total BCE au 16/10/2026 : 37"])("« %s » refusé quand le total est faux", (texte) => {
      const ecarts = controlerLivrableProspection(texte, avecBce);
      expect(ecarts.map((e) => e.code)).toEqual(["total_incoherent"]);
      expect(ecarts[0]!.message).toContain("36");
    });
  });

  it("un livrable juste n'a aucun écart", () => {
    expect(controlerLivrableProspection("2 + 37 + 126 = 165\n\nTotal OpenStreetMap : 165 résultats.\n\nLa passe couvre 2 codes postaux : 4000 et 4041.", complete)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Porte (fonction pure)                                               */
/* ------------------------------------------------------------------ */

function entreesPorte(livrable: string, depots: DepotCouverture[]): EntreesPorte {
  return {
    porte: { exigencesCiblees: [], revuesRequises: [], maxCycles: 3 },
    exigences: [], livrable: { revisionId: REV1 }, couvertures: [], verdicts: [], constats: [], revisionsDejaRefusees: [],
    prospection: { livrable, couverture: calculerCouverture({ bureaux: [LIEGE, AYWAILLE], rayonKm: 10, referentiel: MINI, depots }) },
  };
}

describe("porte : couverture de prospection", () => {
  const tout = depot("osm_commerces", { codes_postaux: ["4000", "4041", "4171", "4460", "4920"] }, { total: 166 });

  it("refuse quand une zone manque et nomme les zones manquantes", () => {
    const r = evaluerPorte(entreesPorte("Liste.", [depot("osm_commerces", { codes_postaux: ["4000", "4920"] }, { total: 50 })]));
    expect(r.decision).toBe("REFUS");
    const m = r.motifs.find((x) => x.code === "couverture_zone_manquante")!;
    expect(m.element).toBe("4041, 4171, 4460");
    expect(m.message).toContain("4041 (Milmort, Vottem)");
    expect(m.message).toContain("4460 (Grâce-Hollogne, Horion-Hozémont)");
  });

  it("accepte quand toutes les zones sont interrogées et les totaux justes", () => {
    const r = evaluerPorte(entreesPorte("Total OpenStreetMap : 166 résultats (calcul machine).", [tout]));
    expect(r.motifs).toEqual([]);
    expect(r.decision).toBe("PASS");
  });

  it("un total faux est signalé même quand la couverture est complète", () => {
    const r = evaluerPorte(entreesPorte("Totaux OSM : 2 + 37 + 127 = 165.", [tout]));
    expect(r.decision).toBe("REFUS");
    expect(r.motifs.map((x) => x.code)).toEqual(["total_incoherent"]);
  });

  it("sans bureau positionné : information manquante (bloque), jamais une liste choisie par l'agent", () => {
    const r = evaluerPorte({ ...entreesPorte("x", [tout]), prospection: { livrable: "x", couverture: null } });
    expect(r.decision).toBe("BLOQUE_INFORMATION");
  });

  it("l'empreinte change quand la couverture change", () => {
    expect(evaluerPorte(entreesPorte("x", [tout])).empreinte).not.toBe(evaluerPorte(entreesPorte("x", [])).empreinte);
  });
});

/* ------------------------------------------------------------------ */
/* Route et porte à travers l'aiguillage réel                          */
/* ------------------------------------------------------------------ */

const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MARQUE = { entites: [], etablissements: [{ nom: "Bureau de Liège", adresse: null, confirme: true, position: { lat: LIEGE.lat, lon: LIEGE.lon } }, { nom: "Bureau d'Aywaille", adresse: null, confirme: true, position: { lat: AYWAILLE.lat, lon: AYWAILLE.lon } }] };

function banc(o: { marque?: Ligne | null; nomProducteur?: string } = {}) {
  const b = creerBanc();
  const ext: Record<string, unknown> = { marques: async (c: string) => (c === SOC && o.marque !== null ? [o.marque ?? MARQUE] : []) };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  if (o.nomProducteur) {
    const get = (b.ctx.agents as Ligne).get;
    (b.ctx.agents as Ligne).get = async (id: string) => ({ ...(await get(id)), name: id === PRODUCTEUR ? o.nomProducteur : id });
  }
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
  async function appeler(routeKey: string, o2: { params?: Record<string, string>; query?: Record<string, string>; companyId?: string; agent?: boolean }) {
    return aiguillage.traiterRequeteApi({
      routeKey, method: routeKey === "prospection.couverture" ? "GET" : "POST", path: "/x", params: o2.params ?? {}, query: o2.query ?? {}, body: undefined,
      actor: o2.agent === false ? { actorType: "user", actorId: "local-board", userId: "local-board", runId: null } : { actorType: "agent", actorId: PRODUCTEUR, agentId: PRODUCTEUR, runId: "run-1" },
      companyId: o2.companyId ?? SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  /** Entrée de journal telle que le dépôt signé l'écrit (services-prospection.ts). */
  async function deposer(outil: string, args: Record<string, unknown>, total: number, companyId = SOC) {
    await b.base.journaliser({ companyId, type: "prospects.deposes", entite: "source", entiteId: "s", issueId: ISSUE, donnees: { service: outil.split("_")[0], outil, campagneId: CAMP, appel: { arguments: args, total, page: 1, pages: 1 } } });
    b.t.sources.push({ id: `src-${b.t.sources.length}`, companyId, issueId: ISSUE, mode: "demonstration", provenance: "connexion", url: `connexion://osm/${outil}`, connexion: { service: "osm", outil, chiffres: [] } });
  }
  const couverture = (companyId = SOC, agent = true) => appeler("prospection.couverture", { query: { companyId, campagneId: CAMP }, companyId, agent });
  return { ...b, appeler, deposer, couverture };
}

describe("route prospection.couverture", () => {
  it("un agent la lit : zones calculées, interrogées marquées, phrases à citer", async () => {
    const f = banc();
    await f.deposer("osm_commerces", { codes_postaux: ["4041"] }, 25);
    const r = await f.couverture();
    expect(r.status).toBe(200);
    expect(r.body.rayonKm).toBe(10);
    expect(r.body.bureaux).toHaveLength(2);
    const z4041 = r.body.zones.find((z: Ligne) => z.codePostal === "4041");
    expect(z4041.interrogee).toEqual({ osm_commerces: true, bce_rechercher: false });
    expect(r.body.zones.find((z: Ligne) => z.codePostal === "4460").interrogee.osm_commerces).toBe(false);
    expect(r.body.complete).toBe(false);
    expect(r.body.totaux.osm_commerces.total).toBe(25);
    expect(r.body.source.licence).toMatch(/ODbL/u);
    expect(r.body.consigne).toMatch(/CHAQUE code postal/u);
  });

  it("isolation entre entreprises : les dépôts et la campagne d'une autre entreprise ne comptent pas", async () => {
    const f = banc();
    await f.deposer("osm_commerces", { codes_postaux: ["4041"] }, 25, SOC2);
    const r = await f.couverture();
    expect(r.body.outilsRequis).toEqual([]);
    expect(r.body.zones.every((z: Ligne) => !z.interrogee.osm_commerces)).toBe(true);
    const autre = await f.couverture(SOC2);
    expect(autre.status).toBe(404);
  });

  it("campagneId absent ou invalide : 400", async () => {
    const f = banc();
    const r = await f.appeler("prospection.couverture", { query: { companyId: SOC } });
    expect(r.status).toBe(400);
  });
});

describe("porte à travers les services", () => {
  it("tâche de prospection : refus qui nomme les zones manquantes, puis accord une fois tout interrogé", async () => {
    const f = banc();
    f.tacheSousPorte({ corps: "# Prospects (démonstration)\n\nListe déposée (démonstration)." });
    await f.deposer("osm_commerces", { codes_postaux: ["4000"] }, 10);
    const avant = (await f.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { decision: string; motifs: Ligne[] };
    expect(avant.decision).toBe("REFUS");
    const m = avant.motifs.find((x) => x.code === "couverture_zone_manquante")!;
    expect(m.message).toContain("4041");
    expect(m.message).toContain("4460");

    const zones = (await f.couverture()).body.zones.map((z: Ligne) => z.codePostal) as string[];
    await f.deposer("osm_commerces", { codes_postaux: zones }, 40);
    const apres = (await f.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { decision: string; motifs: Ligne[] };
    expect(apres.motifs.map((x) => x.code)).not.toContain("couverture_zone_manquante");
    expect(apres.motifs).toEqual([]);
    expect(apres.decision).toBe("PASS");
  });

  it("producteur Prospection sans aucun dépôt : refus ; tâche d'un autre rôle sans dépôt : règle non appliquée", async () => {
    const p = banc({ nomProducteur: "Prospection" });
    p.tacheSousPorte({ corps: "# Prospects\n\nAucun." });
    const ev = (await p.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { decision: string; motifs: Ligne[] };
    expect(ev.decision).toBe("REFUS");
    expect(ev.motifs.find((x) => x.code === "couverture_zone_manquante")!.message).toMatch(/Aucune requête osm_commerces ni bce_rechercher/u);

    const autre = banc();
    autre.tacheSousPorte({ corps: "# Page\n\nTexte." });
    const ok = (await autre.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { decision: string };
    expect(ok.decision).toBe("PASS");
  });
});
