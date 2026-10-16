/**
 * Confiance de qualification des prospects : calcul pondéré par critères vérifiés (distinct du score de
 * conversion), plafond par un critère contraire, critères manquants et outils de la passerelle qui
 * pourraient les établir. Courtier fictif (REFERENTIEL_COURTIER), aucune donnée réelle.
 */
import { describe, expect, it } from "vitest";
import { ConfianceQualification, Prospect, SEUIL_QUALIFICATION } from "../src/contrats/index.js";
import { PROSPECT_B2B, PROSPECT_B2C, REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import {
  POIDS_QUALIFICATION_DEFAUT,
  PLAFOND_CONTRAIRE,
  calculerConfiance,
  criteresManquants,
  RAYON_ZONE_DEFAUT_KM,
  type ContexteQualification,
} from "../src/serveur/qualification-prospects.js";
import { provinceDuCodePostal } from "../src/serveur/geo.js";

const H = "2026-10-15T10:00:00.000Z";
const CTX: ContexteQualification = {
  cibles: REFERENTIEL_COURTIER.ciblesProspection as never,
  segments: REFERENTIEL_COURTIER.segments as never,
  etablissements: REFERENTIEL_COURTIER.etablissements as never,
  baseClientsImportee: true,
  maintenant: H,
};
const SRC_BNB = { type: "depot_signe", sourceId: "c3333333-3333-4333-8333-333333333333", service: "bnb", outil: "bnb_comptes", url: null, collecteLe: H };
const SRC_OSM = { type: "depot_signe", sourceId: "c2222222-2222-4222-8222-222222222222", service: "osm", outil: "osm_commerces", url: null, collecteLe: H };

const entreprise = (o: Record<string, unknown> = {}) => {
  const base = structuredClone(PROSPECT_B2B) as Record<string, unknown>;
  return Prospect.parse({ ...base, statut: "nouveau", score: null, ...o });
};
const statuts = (p: Prospect, ctx = CTX) => Object.fromEntries(calculerConfiance(p, ctx).criteres.map((c) => [c.code, c.statut]));

describe("calcul de la confiance de qualification", () => {
  it("la somme des poids par défaut vaut 100", () => {
    expect(Object.values(POIDS_QUALIFICATION_DEFAUT).reduce((a, b) => a + b, 0)).toBe(100);
    expect(POIDS_QUALIFICATION_DEFAUT).toEqual({ entreprise_active: 20, segment_cible: 20, zone_cible: 15, joignable_legalement: 15, pas_deja_client: 10, taille_connue: 10, sources_concordantes: 10 });
  });

  it("tous les critères vérifiés : 100 %, qualifié, chaque critère cite sa source", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
    const c = calculerConfiance(p, CTX);
    expect(c).toMatchObject({ valeur: 100, qualifie: true, plafonnee: false, seuil: 90 });
    expect(c.criteres).toHaveLength(7);
    expect(c.criteres.every((x) => x.statut === "verifie")).toBe(true);
    expect(c.criteres.find((x) => x.code === "entreprise_active")).toMatchObject({ sourceId: "c1111111-1111-4111-8111-111111111111", source: "BCE · bce_rechercher" });
    expect(c.criteres.find((x) => x.code === "taille_connue")?.sourceId).toBe(SRC_BNB.sourceId);
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });

  it("un critère manquant ne rapporte rien : taille inconnue = 90 %, juste qualifié", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    const c = calculerConfiance(p, CTX);
    expect(c.valeur).toBe(90);
    expect(c.qualifie).toBe(true);
    expect(statuts(p).taille_connue).toBe("non_verifie");
  });

  it("actif, segment, zone, joignable, concordance et taille vérifiés (sans « pas déjà client ») : 90 %, qualifié", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM, { ...SRC_BNB, taille: { exercice: 2025, effectifEtp: 6, categorie: "petite" } }] });
    const c = calculerConfiance(p, { ...CTX, baseClientsImportee: false });
    expect(statuts(p, { ...CTX, baseClientsImportee: false })).toMatchObject({ taille_connue: "verifie", pas_deja_client: "non_verifie" });
    expect(c).toMatchObject({ valeur: 90, qualifie: true, plafonnee: false });
  });

  it("deux critères manquants : confiance sous le seuil, à enrichir (jamais par hypothèse)", () => {
    // Une seule source (pas de concordance) et pas de base de clients importée : 100 - 10 - 10 - 10 = 70.
    const p = entreprise();
    const c = calculerConfiance(p, { ...CTX, baseClientsImportee: false });
    expect(c.valeur).toBe(70);
    expect(c.qualifie).toBe(false);
    expect(c.valeur).toBeLessThan(SEUIL_QUALIFICATION);
  });

  it("un critère contraire plafonne à 50 % et rend non qualifié, même si tout le reste est vérifié", () => {
    // NACE hors des segments visés (commerce de détail) : contraire, alors que 6 critères sur 7 sont vérifiés.
    const p = entreprise({ nace: ["47.110"], sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
    const c = calculerConfiance(p, CTX);
    expect(statuts(p).segment_cible).toBe("contraire");
    expect(c).toMatchObject({ valeur: PLAFOND_CONTRAIRE, qualifie: false, plafonnee: true });
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });

  it("zone hors cible, opposition et client actuel sont des critères contraires", () => {
    expect(statuts(entreprise({ zone: { codePostal: "1000", commune: "Bruxelles", province: null, region: "Bruxelles-Capitale", pays: "BE" } })).zone_cible).toBe("contraire");
    const motif = (m: string) => [{ motif: m, detail: "test", constateLe: H }];
    expect(statuts(entreprise({ statut: "exclu", motifsExclusion: motif("opposition_client") })).joignable_legalement).toBe("contraire");
    expect(statuts(entreprise({ statut: "exclu", motifsExclusion: motif("client_actuel") })).pas_deja_client).toBe("contraire");
    expect(statuts(entreprise({ statut: "exclu", motifsExclusion: motif("entreprise_inactive") })).entreprise_active).toBe("contraire");
  });

  describe("critère zone : distance, province et information manquante", () => {
    const BUREAU = { lat: 50.6326, lon: 5.5797 };
    const CTX_POS: ContexteQualification = {
      ...CTX,
      etablissements: CTX.etablissements.map((e) => (e.code === "bureau-liege" ? { ...e, position: BUREAU } : e)) as never,
    };
    const zone = (o: Record<string, unknown>) => entreprise({ zone: { codePostal: null, commune: null, province: null, region: null, pays: "BE", ...o } });
    const detail = (p: Prospect, ctx: ContexteQualification) => calculerConfiance(p, ctx).criteres.find((c) => c.code === "zone_cible")!;

    it("cabinet à environ 3 km du bureau, autre code postal : vérifié avec la distance", () => {
      const p = zone({ codePostal: "4100", position: { lat: 50.6326 + 0.027, lon: 5.5797, precision: "exacte" } });
      expect(statuts(p, CTX_POS).zone_cible).toBe("verifie");
      expect(detail(p, CTX_POS).detail).toMatch(/À 3 km du bureau Bureau de Liège/u);
    });

    it("cabinet à environ 25 km : contraire, avec la distance", () => {
      const p = zone({ codePostal: "4100", position: { lat: 50.6326 + 0.225, lon: 5.5797, precision: "exacte" } });
      expect(statuts(p, CTX_POS).zone_cible).toBe("contraire");
      expect(detail(p, CTX_POS).detail).toMatch(/À 25 km du bureau/u);
    });

    it("sans position, code postal 4020 et cible Liège : vérifié par la province", () => {
      const ctx: ContexteQualification = { ...CTX, cibles: CTX.cibles.map((c) => ({ ...c, zones: { etablissements: [], communes: [], codesPostaux: [], provinces: ["Liège"], regions: [] } })) as never };
      expect(statuts(zone({ codePostal: "4600" }), ctx).zone_cible).toBe("verifie");
      expect(statuts(zone({ codePostal: "5000" }), ctx).zone_cible).toBe("contraire");
    });

    it("aucune information exploitable : non vérifié, jamais contraire", () => {
      // Code postal inconnu de toute tranche, sans position : on ne sait pas.
      expect(statuts(zone({ commune: "Ailleurs" }), CTX).zone_cible).toBe("non_verifie");
    });

    it("les tranches de codes postaux donnent la bonne province", () => {
      expect(provinceDuCodePostal("1000")).toBe("Bruxelles-Capitale");
      expect(provinceDuCodePostal("1348")).toBe("Brabant wallon");
      expect(provinceDuCodePostal("3000")).toBe("Brabant flamand");
      expect(provinceDuCodePostal("3500")).toBe("Limbourg");
      expect(provinceDuCodePostal("6600")).toBe("Luxembourg");
      expect(provinceDuCodePostal("7000")).toBe("Hainaut");
      expect(provinceDuCodePostal("9999")).toBe("Flandre-Orientale");
      expect(RAYON_ZONE_DEFAUT_KM).toBe(10);
    });
  });

  it("particulier : la taille n'entre pas dans le calcul ; devis dans la zone d'un bureau et segment propriétaire", () => {
    const p = Prospect.parse({ ...structuredClone(PROSPECT_B2C), score: null, referentiel: { ...PROSPECT_B2C.referentiel, segments: ["proprietaires"], cibleProspection: null }, zone: { codePostal: "4430", commune: "Ans", province: "Liège", region: "Wallonie", pays: "BE" } });
    const c = calculerConfiance(p, CTX);
    expect(c.criteres.map((x) => x.code)).not.toContain("taille_connue");
    expect(c.criteres).toHaveLength(6);
    expect(c.criteres.find((x) => x.code === "entreprise_active")?.statut).toBe("verifie");
    expect(c.criteres.find((x) => x.code === "zone_cible")?.statut).toBe("verifie");
    expect(c.criteres.find((x) => x.code === "segment_cible")?.statut).toBe("verifie");
  });

  it("sans cible de prospection définie, segment et zone restent non vérifiés (aucune hypothèse)", () => {
    const s = statuts(entreprise(), { ...CTX, cibles: [] });
    expect(s.segment_cible).toBe("non_verifie");
    expect(s.zone_cible).toBe("non_verifie");
  });

  it("critères manquants : outil de la passerelle pour chacun, geste humain pour la base légale et la base de clients", () => {
    const p = entreprise({ basesLegales: [] });
    const c = calculerConfiance(p, { ...CTX, baseClientsImportee: false });
    const m = criteresManquants(p, c);
    expect(m).toMatchObject({ prospectId: p.id, qualifie: false, seuil: 90, contraires: [] });
    const par = Object.fromEntries(m.manquants.map((x) => [x.code, x]));
    expect(Object.keys(par).sort()).toEqual(["joignable_legalement", "pas_deja_client", "sources_concordantes", "taille_connue"]);
    expect(par.taille_connue!.verifiePar).toEqual([expect.objectContaining({ service: "bnb", outil: "bnb_comptes" })]);
    expect(par.sources_concordantes!.verifiePar.map((x) => x.outil)).toEqual(["osm_commerces"]);
    expect(par.joignable_legalement!.verifiePar).toEqual([]);
    expect(par.joignable_legalement!.action).toMatch(/base légale/u);
    expect(par.pas_deja_client!.action).toMatch(/base de clients/u);
  });

  it("zone : bce_entreprise et osm_commerces ; partenaire FSMA : fsma_rechercher", () => {
    const sansZone = entreprise({ zone: { codePostal: null, commune: null, province: null, region: null, pays: "BE" } });
    const m = criteresManquants(sansZone, calculerConfiance(sansZone, CTX));
    expect(m.manquants.find((x) => x.code === "zone_cible")!.verifiePar.map((x) => x.outil)).toEqual(["bce_entreprise", "osm_commerces"]);
    const fsma = Prospect.parse({ ...structuredClone(PROSPECT_B2B), cible: "partenaire", statut: "nouveau", score: null, sources: [{ ...SRC_OSM }], basesLegales: [], identifiant: { type: "numero_bce", valeur: PROSPECT_B2B.numeroBce } });
    const mf = criteresManquants(fsma, calculerConfiance(fsma, CTX));
    expect(mf.manquants.find((x) => x.code === "entreprise_active")!.verifiePar.map((x) => x.outil)).toEqual(["fsma_rechercher"]);
  });

  describe("critère segment : lieu OpenStreetMap sans NACE, déduit de sa catégorie", () => {
    const segment = (code: string, nace: string[]) => ({ code, libelle: code === "dentistes" ? "Dentistes" : "Médecins", type: "profession", nace });
    const cible = { ...(REFERENTIEL_COURTIER.ciblesProspection[0] as object), code: "sante", cible: "b2b", segments: ["dentistes", "medecins"] };
    const ctxSante = (segs: ReturnType<typeof segment>[]): ContexteQualification => ({ ...CTX, cibles: [cible] as never, segments: segs as never });
    const lieu = (cle: string, valeur: string) =>
      entreprise({ nace: [], referentiel: { ...PROSPECT_B2B.referentiel, segments: [], cibleProspection: null }, sources: [{ ...SRC_OSM, categorieOsm: { cle, valeur } }] });
    const segmentCible = (p: Prospect, c: ContexteQualification) => calculerConfiance(p, c).criteres.find((x) => x.code === "segment_cible")!;

    it("dentiste OSM dans une cible de dentistes : vérifié, avec le détail", () => {
      const c = segmentCible(lieu("amenity", "dentist"), ctxSante([segment("dentistes", ["86.230"])]));
      expect(c.statut).toBe("verifie");
      expect(c.detail).toBe("Catégorie OpenStreetMap « dentiste » : NACE 86.230 (segment Dentistes)");
      expect(c.sourceId).toBe(SRC_OSM.sourceId);
    });
    it("centre de santé OSM : NACE médecine générale et spécialistes", () => {
      expect(segmentCible(lieu("amenity", "clinic"), ctxSante([segment("medecins", ["86.210", "86.220"])])).statut).toBe("verifie");
    });
    it("vétérinaire OSM dans une cible médicale : contraire", () => {
      const c = segmentCible(lieu("amenity", "veterinary"), ctxSante([segment("medecins", ["86.210", "86.220"])]));
      expect(c.statut).toBe("contraire");
      expect(c.detail).toContain("NACE 75.000 hors des segments");
    });
    it("catégorie inconnue ou absente : non vérifié, comme avant", () => {
      const s = ctxSante([segment("medecins", ["86.210"])]);
      expect(segmentCible(lieu("shop", "bakery"), s)).toMatchObject({ statut: "non_verifie", detail: "Aucun code NACE connu pour ce prospect" });
      expect(segmentCible(entreprise({ nace: [], sources: [SRC_OSM] }), s).statut).toBe("non_verifie");
    });
    it("un NACE de la BCE garde la priorité sur la catégorie OSM", () => {
      const p = entreprise({ nace: ["69.101"], referentiel: { ...PROSPECT_B2B.referentiel, segments: [], cibleProspection: null }, sources: [...PROSPECT_B2B.sources, { ...SRC_OSM, categorieOsm: { cle: "amenity", valeur: "dentist" } }] });
      expect(segmentCible(p, ctxSante([segment("dentistes", ["86.230"])])).statut).toBe("contraire");
    });
  });
});

