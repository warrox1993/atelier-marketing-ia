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
  REGLAGES_QUALIFICATION_DEFAUT,
  type ContexteQualification,
  type ReglagesQualification,
} from "../src/serveur/qualification-prospects.js";
import { provinceDuCodePostal } from "../src/serveur/geo.js";
import { metierRcParNace, naceConcurrent, naceFlotte } from "../src/serveur/regles-criteres-courtier.js";

const H = "2026-10-15T10:00:00.000Z";
/** Contexte du lot 1 : sept critères d'origine + cinq « courtier » du lot 1 (les quatre critères BNB du lot 2 ont leur bloc, plus bas), offres de la fiche du courtier fictif. */
const CTX_TOUS: ContexteQualification = {
  cibles: REFERENTIEL_COURTIER.ciblesProspection as never,
  segments: REFERENTIEL_COURTIER.segments as never,
  etablissements: REFERENTIEL_COURTIER.etablissements as never,
  offres: REFERENTIEL_COURTIER.offres as never,
  baseClientsImportee: true,
  maintenant: H,
};
const NOUVEAUX = ["assurance_obligatoire_metier", "installation_recente", "evenement_recent", "besoin_offre_active", "pas_concurrent"] as const;
/** Les quatre critères « courtier » du lot 2, fondés sur les comptes annuels BNB. */
const LOT2 = ["emploie_personnel", "flotte_probable", "proprietaire_locaux", "sante_financiere"] as const;
/** Les deux critères « courtier » du lot 3 : bureau spécialisé proche (fiche du client) et contact public permis (sources du prospect). */
const LOT3 = ["bureau_specialise_proche", "contact_public_permis"] as const;
/** Contexte des blocs des lots 1 et 2 : le lot 3 est désactivé pour que leur arithmétique (dénominateurs) reste celle de ces lots ; il a son propre bloc plus bas. */
const sansLot2: ReglagesQualification = {
  ...REGLAGES_QUALIFICATION_DEFAUT,
  criteres: { ...REGLAGES_QUALIFICATION_DEFAUT.criteres, ...Object.fromEntries([...LOT3].map((c) => [c, { actif: false, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[c].poids }])), ...Object.fromEntries(LOT2.map((c) => [c, { actif: false, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[c].poids }])) },
};
const CTX_COMPLET: ContexteQualification = { ...CTX_TOUS, reglages: sansLot2 };
/**
 * Réglages « sept critères d'origine seulement » : les tests historiques ci-dessous vérifient l'arithmétique des sept
 * critères d'origine (valeurs inchangées : 100, 90, 70 %...), sans que les cinq critères « courtier » la déplacent.
 * Les cinq nouveaux critères ont leur propre bloc de tests, plus bas, avec les réglages par défaut complets.
 */
const BASE_SEULE: ReglagesQualification = {
  ...REGLAGES_QUALIFICATION_DEFAUT,
  criteres: { ...REGLAGES_QUALIFICATION_DEFAUT.criteres, ...Object.fromEntries([...NOUVEAUX, ...LOT2, ...LOT3].map((c) => [c, { actif: false, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[c].poids }])) },
};
const CTX: ContexteQualification = { ...CTX_COMPLET, reglages: BASE_SEULE };
const SRC_BNB = { type: "depot_signe", sourceId: "c3333333-3333-4333-8333-333333333333", service: "bnb", outil: "bnb_comptes", url: null, collecteLe: H };
const SRC_OSM = { type: "depot_signe", sourceId: "c2222222-2222-4222-8222-222222222222", service: "osm", outil: "osm_commerces", url: null, collecteLe: H };

const entreprise = (o: Record<string, unknown> = {}) => {
  const base = structuredClone(PROSPECT_B2B) as Record<string, unknown>;
  return Prospect.parse({ ...base, statut: "nouveau", score: null, ...o });
};
const statuts = (p: Prospect, ctx = CTX) => Object.fromEntries(calculerConfiance(p, ctx).criteres.map((c) => [c.code, c.statut]));

describe("calcul de la confiance de qualification", () => {
  it("poids par défaut : les sept critères d'origine pèsent 100, les cinq critères courtier 36 de plus, les quatre critères BNB 20 de plus (la confiance est normalisée sur les poids actifs)", () => {
    const base = ["entreprise_active", "segment_cible", "zone_cible", "joignable_legalement", "pas_deja_client", "taille_connue", "sources_concordantes"] as const;
    expect(base.reduce((t, c) => t + POIDS_QUALIFICATION_DEFAUT[c], 0)).toBe(100);
    expect(NOUVEAUX.reduce((t, c) => t + POIDS_QUALIFICATION_DEFAUT[c], 0)).toBe(36);
    expect(LOT2.reduce((t, c) => t + POIDS_QUALIFICATION_DEFAUT[c], 0)).toBe(20);
    expect(LOT3.reduce((t, c) => t + POIDS_QUALIFICATION_DEFAUT[c], 0)).toBe(12);
    expect(POIDS_QUALIFICATION_DEFAUT).toEqual({
      entreprise_active: 20, segment_cible: 20, zone_cible: 15, joignable_legalement: 15, pas_deja_client: 10, taille_connue: 10, sources_concordantes: 10,
      assurance_obligatoire_metier: 10, installation_recente: 8, evenement_recent: 8, besoin_offre_active: 10, pas_concurrent: 0,
      emploie_personnel: 6, flotte_probable: 4, proprietaire_locaux: 4, sante_financiere: 6,
      bureau_specialise_proche: 6, contact_public_permis: 6,
    });
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
    it("laboratoire, planning familial, don de sang : contraire, hors des professions visées", () => {
      const s = ctxSante([segment("medecins", ["86.210", "86.220"])]);
      const lab = segmentCible(lieu("healthcare", "laboratory"), s);
      expect(lab.statut).toBe("contraire");
      expect(lab.detail).toBe("Catégorie OpenStreetMap « laboratoire » : hors des professions visées");
      expect(segmentCible(lieu("healthcare", "counselling"), s).statut).toBe("contraire");
      expect(segmentCible(lieu("amenity", "social_facility"), s).statut).toBe("contraire");
      expect(segmentCible(lieu("healthcare", "blood_donation"), s).statut).toBe("contraire");
      expect(segmentCible(lieu("healthcare", "podiatrist"), s).statut).toBe("contraire");
      expect(segmentCible(lieu("healthcare", "speech_therapist"), s).statut).toBe("contraire");
      expect(segmentCible(lieu("amenity", "dentist"), ctxSante([segment("dentistes", ["86.230"])])).statut).toBe("verifie");
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


describe("réglages des leads : critères, poids, seuil, critères personnalisés et décisions humaines", () => {
  const tout = () => entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
  const regle = (o: Partial<ReglagesQualification> & { modif?: Partial<Record<string, { actif: boolean; poids: number }>> } = {}): ReglagesQualification => ({
    criteres: { ...BASE_SEULE.criteres, ...(o.modif as ReglagesQualification["criteres"]) },
    seuil: o.seuil ?? 90,
    personnalises: o.personnalises ?? [],
  });
  const DECISION = { auteur: "user-jb", date: "2026-10-16T08:00:00.000Z", justification: "Appel du gérant : activité confirmée" };

  it("réglages par défaut explicites : résultat identique au calcul sans réglages", () => {
    for (const p of [tout(), entreprise(), entreprise({ nace: ["47.110"] })]) {
      expect(calculerConfiance(p, { ...CTX_TOUS, reglages: REGLAGES_QUALIFICATION_DEFAUT, corrections: new Map() })).toEqual(calculerConfiance(p, CTX_TOUS));
    }
  });

  it("critère désactivé : retiré du calcul (taille inconnue ne coûte plus rien)", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    expect(calculerConfiance(p, CTX).valeur).toBe(90);
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ modif: { taille_connue: { actif: false, poids: 10 } } }) });
    expect(c.criteres.map((x) => x.code)).not.toContain("taille_connue");
    expect(c.criteres).toHaveLength(6);
    expect(c.valeur).toBe(100);
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });

  it("un critère contraire désactivé ne plafonne plus ; actif, il plafonne toujours à 50 %", () => {
    const p = entreprise({ nace: ["47.110"], sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
    expect(calculerConfiance(p, CTX)).toMatchObject({ valeur: 50, plafonnee: true, qualifie: false });
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ modif: { segment_cible: { actif: false, poids: 20 } } }) });
    expect(c).toMatchObject({ valeur: 100, plafonnee: false, qualifie: true });
  });

  it("poids changé : la moyenne pondérée suit les poids du client", () => {
    // Une seule source, pas de base de clients : manquent concordance (10), taille (10), pas déjà client (10) = 70 %.
    const p = entreprise();
    const ctx = { ...CTX, baseClientsImportee: false };
    expect(calculerConfiance(p, ctx).valeur).toBe(70);
    // Taille portée à 70 : acquis 70 sur 100 + 60 = 160 -> 70 / 160 = 43,75 -> 44.
    const c = calculerConfiance(p, { ...ctx, reglages: regle({ modif: { taille_connue: { actif: true, poids: 70 } } }) });
    expect(c.criteres.find((x) => x.code === "taille_connue")?.poids).toBe(70);
    expect(c.valeur).toBe(44);
  });

  it("seuil changé : 80 rend qualifié un lead à 80 % ; le seuil est rendu dans la confiance", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    const ctx = { ...CTX, baseClientsImportee: false };
    expect(calculerConfiance(p, ctx)).toMatchObject({ valeur: 80, qualifie: false, seuil: 90 });
    const c = calculerConfiance(p, { ...ctx, reglages: regle({ seuil: 80 }) });
    expect(c).toMatchObject({ valeur: 80, qualifie: true, seuil: 80 });
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
    expect(criteresManquants(p, c).seuil).toBe(80);
  });

  it("seuil à 50 : un lead plafonné à 50 % par un critère contraire reste non qualifié", () => {
    const p = entreprise({ nace: ["47.110"], sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ seuil: 50 }) });
    expect(c).toMatchObject({ valeur: 50, plafonnee: true, qualifie: false });
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });

  it("critère personnalisé : non vérifié par défaut, il ne rapporte rien et figure dans les manquants avec un geste humain", () => {
    const perso = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "Carte de visite reçue" };
    const p = tout();
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }) });
    const x = c.criteres.find((k) => k.code === "rencontre_salon");
    expect(x).toMatchObject({ libelle: "Rencontré au salon", poids: 25, statut: "non_verifie", sourceId: null, detail: "Critère personnalisé : pas encore évalué par l'agent Prospection" });
    expect(c.valeur).toBe(80); // 100 sur 125
    expect(c.qualifie).toBe(false);
    const m = criteresManquants(p, c);
    expect(m.manquants.find((k) => k.code === "rencontre_salon")).toMatchObject({ verifiePar: [], action: expect.stringContaining("agent Prospection") });
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });

  it("critère personnalisé coché à la main : vérifié, source « humain », détail de la décision", () => {
    const perso = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "" };
    const p = tout();
    const corrections = new Map([[p.id, [{ code: "rencontre_salon", statut: "verifie" as const, ...DECISION }]]]);
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), corrections });
    expect(c.criteres.find((k) => k.code === "rencontre_salon")).toMatchObject({
      statut: "verifie", source: "humain", sourceId: null, detail: "Décision humaine de user-jb le 16/10/2026 : Appel du gérant : activité confirmée",
    });
    expect(c).toMatchObject({ valeur: 100, qualifie: true });
  });

  it("critère personnalisé évalué par l'agent : la confiance change, source « agent », détail daté avec sources ; contraire plafonne", () => {
    const perso = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "Carte de visite reçue" };
    const p = tout();
    const ev = { code: "rencontre_salon", statut: "verifie" as const, justification: "Exposant du salon 2026", sources: ["https://salon.example/dupont", "connaissance://fiche/salon"], agent: "agent-prospection", date: "2026-10-16T08:00:00.000Z" };
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), evaluations: new Map([[p.id, [ev]]]) });
    expect(c.criteres.find((k) => k.code === "rencontre_salon")).toMatchObject({
      statut: "verifie", source: "agent", sourceId: null,
      detail: "Évalué par l'agent le 16/10/2026 : Exposant du salon 2026 (sources : https://salon.example/dupont, connaissance://fiche/salon)",
    });
    expect(c).toMatchObject({ valeur: 100, qualifie: true });
    const contraire = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), evaluations: new Map([[p.id, [{ ...ev, statut: "contraire" as const }]]]) });
    expect(contraire).toMatchObject({ valeur: 50, plafonnee: true, qualifie: false });
    expect(ConfianceQualification.safeParse(c).success && ConfianceQualification.safeParse(contraire).success).toBe(true);
    // Évaluée « non vérifié » par l'agent : détail de l'agent, aucun point.
    const nv = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), evaluations: new Map([[p.id, [{ ...ev, statut: "non_verifie" as const, sources: [] }]]]) });
    expect(nv.criteres.find((k) => k.code === "rencontre_salon")).toMatchObject({ statut: "non_verifie", source: "agent" });
    expect(nv.valeur).toBe(80);
  });

  it("la décision humaine prime sur l'évaluation de l'agent ; une évaluation ne vaut que pour SON prospect et un critère personnalisé actuel", () => {
    const perso = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "" };
    const p = tout();
    const ev = { code: "rencontre_salon", statut: "verifie" as const, justification: "Exposant du salon 2026", sources: ["https://salon.example/dupont"], agent: "agent-prospection", date: "2026-10-16T08:00:00.000Z" };
    const humain = { code: "rencontre_salon", statut: "contraire" as const, ...DECISION, justification: "Appel : jamais venu" };
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), evaluations: new Map([[p.id, [ev]]]), corrections: new Map([[p.id, [humain]]]) });
    expect(c.criteres.find((k) => k.code === "rencontre_salon")).toMatchObject({ statut: "contraire", source: "humain", detail: expect.stringContaining("Appel : jamais venu") });
    const autre = calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }), evaluations: new Map([["dddddddd-dddd-4ddd-8ddd-dddddddddddd", [ev]]]) });
    expect(autre.criteres.find((k) => k.code === "rencontre_salon")!.statut).toBe("non_verifie");
    // Critère retiré des réglages : l'évaluation orpheline est ignorée.
    expect(calculerConfiance(p, { ...CTX, evaluations: new Map([[p.id, [ev]]]) })).toEqual(calculerConfiance(p, CTX));
  });

  it("critère personnalisé non vérifié : l'aide à la vérification reprend sa description pour l'agent", () => {
    const perso = { code: "rencontre_salon", libelle: "Rencontré au salon", poids: 25, description: "Carte de visite reçue" };
    const p = tout();
    const m = criteresManquants(p, calculerConfiance(p, { ...CTX, reglages: regle({ personnalises: [perso] }) }), [perso]);
    expect(m.manquants.find((k) => k.code === "rencontre_salon")!.action).toContain("Carte de visite reçue");
  });

  it("correction humaine : un critère non vérifié passe à vérifié, un critère vérifié passe à contraire (plafond conservé)", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    expect(statuts(p).taille_connue).toBe("non_verifie");
    const verifie = calculerConfiance(p, { ...CTX, corrections: new Map([[p.id, [{ code: "taille_connue", statut: "verifie" as const, ...DECISION }]]]) });
    expect(verifie.criteres.find((k) => k.code === "taille_connue")).toMatchObject({ statut: "verifie", source: "humain" });
    expect(verifie.valeur).toBe(100);

    const contraire = calculerConfiance(p, { ...CTX, corrections: new Map([[p.id, [{ code: "entreprise_active", statut: "contraire" as const, ...DECISION, justification: "Cessation annoncée" }]]]) });
    expect(contraire.criteres.find((k) => k.code === "entreprise_active")).toMatchObject({ statut: "contraire", source: "humain", detail: expect.stringContaining("Cessation annoncée") });
    expect(contraire).toMatchObject({ valeur: 50, plafonnee: true, qualifie: false });
    expect(ConfianceQualification.safeParse(contraire).success).toBe(true);
  });

  it("une correction ne vaut que pour SON prospect et SON critère", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    const autre = new Map([["dddddddd-dddd-4ddd-8ddd-dddddddddddd", [{ code: "taille_connue", statut: "verifie" as const, ...DECISION }]]]);
    expect(calculerConfiance(p, { ...CTX, corrections: autre })).toEqual(calculerConfiance(p, CTX));
  });

  it("une correction d'un critère désactivé ou d'un critère personnalisé supprimé est ignorée", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM] });
    const corrections = new Map([[p.id, [{ code: "ancien_critere", statut: "verifie" as const, ...DECISION }, { code: "taille_connue", statut: "contraire" as const, ...DECISION }]]]);
    const c = calculerConfiance(p, { ...CTX, reglages: regle({ modif: { taille_connue: { actif: false, poids: 10 } } }), corrections });
    expect(c.criteres.map((k) => k.code)).not.toContain("ancien_critere");
    expect(c).toMatchObject({ valeur: 100, plafonnee: false });
  });
});

/* ------------------------------------------------------------------ */
/* Critères spécialisés « courtier » (lot 1) : A1, A2, A3, A7, B10      */
/* ------------------------------------------------------------------ */

describe("critères courtier : besoin d'assurance prouvé et concurrence", () => {
  /** Date AAAA-MM-JJ située `mois` mois (et `jours` jours) avant l'horodatage de calcul H. */
  const avant = (mois: number, jours = 0) => {
    const d = new Date(H);
    d.setUTCMonth(d.getUTCMonth() - mois);
    d.setUTCDate(d.getUTCDate() - jours);
    return d.toISOString().slice(0, 10);
  };
  const bce = (faits?: { code: string; date: string }[]) => ({ ...PROSPECT_B2B.sources[0], ...(faits ? { faits } : {}) });
  const FSMA = { type: "depot_signe", sourceId: "c4444444-4444-4444-8444-444444444444", service: "fsma", outil: "fsma_rechercher", url: null, collecteLe: H };
  const FAITS_RECENTS = [{ code: "debut_entreprise", date: avant(6) }, { code: "nouvel_etablissement", date: avant(2) }];
  const critere = (p: Prospect, code: string, ctx: ContexteQualification = CTX_COMPLET) => calculerConfiance(p, ctx).criteres.find((c) => c.code === code);
  /** Lead parfait : les douze critères vérifiés (BCE avec faits récents, OSM, BNB, base légale du modèle, base de clients, offres RC pro et pension). */
  const parfait = () => entreprise({ sources: [bce(FAITS_RECENTS), SRC_OSM, SRC_BNB] });
  /** Réglages du lot 1 (lot 2 désactivé) dont les `codes` sont aussi désactivés. */
  const reglagesSans = (...codes: string[]): ReglagesQualification => ({
    ...sansLot2,
    criteres: { ...sansLot2.criteres, ...Object.fromEntries(codes.map((c) => [c, { actif: false, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[c as keyof typeof REGLAGES_QUALIFICATION_DEFAUT.criteres].poids }])) },
  });

  describe("A1 : assurance obligatoire pour son métier", () => {
    it("vérifié : NACE d'un médecin (86.210), détail avec source BCE et raison", () => {
      const c = critere(entreprise(), "assurance_obligatoire_metier")!;
      expect(c).toMatchObject({ statut: "verifie", poids: 10, sourceId: PROSPECT_B2B.sources[0]!.sourceId, source: "BCE · bce_rechercher" });
      expect(c.detail).toContain("NACE 86.210 : médecin");
    });

    it("vérifié par préfixe : avocat 69.101, construction 43.910 ; vérifié par catégorie OpenStreetMap sans NACE (office=lawyer)", () => {
      expect(critere(entreprise({ nace: ["69.101"] }), "assurance_obligatoire_metier")?.statut).toBe("verifie");
      expect(critere(entreprise({ nace: ["43.910"] }), "assurance_obligatoire_metier")?.statut).toBe("verifie");
      const lieu = entreprise({ nace: [], sources: [{ ...SRC_OSM, categorieOsm: { cle: "office", valeur: "lawyer" } }] });
      expect(critere(lieu, "assurance_obligatoire_metier")).toMatchObject({ statut: "verifie", sourceId: SRC_OSM.sourceId });
    });

    it("métier sans RC obligatoire (commerce 47.110) : sans objet, le critère sort du calcul ; jamais contraire", () => {
      const p = entreprise({ nace: ["47.110"] });
      expect(calculerConfiance(p, CTX_COMPLET).criteres.map((c) => c.code)).not.toContain("assurance_obligatoire_metier");
      expect(calculerConfiance(p, CTX_COMPLET).criteres.every((c) => c.statut !== "contraire" || c.code !== "assurance_obligatoire_metier")).toBe(true);
    });

    it("sans NACE ni catégorie : non vérifié, jamais deviné", () => {
      expect(critere(entreprise({ nace: [] }), "assurance_obligatoire_metier")).toMatchObject({ statut: "non_verifie", sourceId: null });
    });
  });

  describe("A2 : installation de moins de 24 mois", () => {
    it("vérifié : début d'activité il y a 6 mois, détail avec la date du fait et la date de relevé", () => {
      const c = critere(entreprise({ sources: [bce(FAITS_RECENTS)] }), "installation_recente")!;
      expect(c).toMatchObject({ statut: "verifie", poids: 8, sourceId: PROSPECT_B2B.sources[0]!.sourceId });
      expect(c.detail).toContain(`début d'activité le ${avant(6).slice(8, 10)}/${avant(6).slice(5, 7)}/`);
      expect(c.detail).toContain("relevé du 15/10/2026");
    });

    it("limite : 24 mois pile compte, 24 mois et un jour ne comptent plus (sans objet, sort du calcul)", () => {
      expect(critere(entreprise({ sources: [bce([{ code: "debut_entreprise", date: avant(24) }])] }), "installation_recente")?.statut).toBe("verifie");
      expect(critere(entreprise({ sources: [bce([{ code: "debut_entreprise", date: avant(24, 1) }])] }), "installation_recente")).toBeUndefined();
    });

    it("entreprise ancienne : sans objet ; sans fait BCE : non vérifié ; date future : non vérifiée", () => {
      expect(critere(entreprise({ sources: [bce([{ code: "debut_entreprise", date: "2001-03-01" }])] }), "installation_recente")).toBeUndefined();
      expect(critere(entreprise(), "installation_recente")).toMatchObject({ statut: "non_verifie", sourceId: null });
      expect(critere(entreprise({ sources: [bce([{ code: "debut_entreprise", date: "2027-01-01" }])] }), "installation_recente")?.statut).toBe("non_verifie");
    });
  });

  describe("A3 : événement de moins de 12 mois", () => {
    it("vérifié : nouvel établissement il y a 2 mois, détail daté et sourcé", () => {
      const c = critere(entreprise({ sources: [bce(FAITS_RECENTS)] }), "evenement_recent")!;
      expect(c).toMatchObject({ statut: "verifie", poids: 8, sourceId: PROSPECT_B2B.sources[0]!.sourceId });
      expect(c.detail).toContain("nouvel établissement le");
      expect(c.detail).toContain("relevé du 15/10/2026");
    });

    it("changement de forme et changement d'adresse comptent aussi ; un début d'activité n'est pas un événement", () => {
      expect(critere(entreprise({ sources: [bce([{ code: "changement_forme", date: avant(11) }])] }), "evenement_recent")?.statut).toBe("verifie");
      expect(critere(entreprise({ sources: [bce([{ code: "changement_adresse", date: avant(1) }])] }), "evenement_recent")?.statut).toBe("verifie");
      expect(critere(entreprise({ sources: [bce([{ code: "debut_entreprise", date: avant(1) }])] }), "evenement_recent")).toBeUndefined();
    });

    it("événement vieux de plus de 12 mois : sans objet ; aucun changement BCE déposé : non vérifié", () => {
      expect(critere(entreprise({ sources: [bce([{ code: "nouvel_etablissement", date: avant(13) }])] }), "evenement_recent")).toBeUndefined();
      expect(critere(entreprise(), "evenement_recent")).toMatchObject({ statut: "non_verifie", sourceId: null });
    });
  });

  describe("A7 : besoin qui correspond à une offre active du courtier", () => {
    it("vérifié : médecin (RC pro obligatoire) et offre RC pro confirmée de la fiche ; le détail cite l'offre", () => {
      const c = critere(entreprise(), "besoin_offre_active")!;
      expect(c).toMatchObject({ statut: "verifie", poids: 10, source: "fiche du client" });
      expect(c.detail).toContain("Responsabilité civile professionnelle");
    });

    it("installation récente : la pension complémentaire de la fiche répond au besoin (même sans RC pro)", () => {
      const offres = [{ nom: "Pension complémentaire", confirmee: true, code: "pension-complementaire" }];
      const p = entreprise({ nace: ["47.110"], sources: [bce([{ code: "debut_entreprise", date: avant(3) }])] });
      expect(critere(p, "besoin_offre_active", { ...CTX_COMPLET, offres })).toMatchObject({ statut: "verifie" });
    });

    it("offre non confirmée, ou aucune offre : non vérifié (besoin détecté, rien à proposer) ; sans besoin : sans objet", () => {
      const nonConfirmee = [{ nom: "Responsabilité civile professionnelle", confirmee: false, code: "rc-pro" }];
      expect(critere(entreprise(), "besoin_offre_active", { ...CTX_COMPLET, offres: nonConfirmee })?.statut).toBe("non_verifie");
      expect(critere(entreprise(), "besoin_offre_active", { ...CTX_COMPLET, offres: [] })?.statut).toBe("non_verifie");
      expect(critere(entreprise({ nace: ["47.110"] }), "besoin_offre_active")).toBeUndefined();
    });
  });

  describe("B10 : pas un concurrent", () => {
    it("vérifié : NACE hors assurance, aucune inscription FSMA ; le détail cite le NACE", () => {
      expect(critere(entreprise(), "pas_concurrent")).toMatchObject({ statut: "verifie", poids: 0, sourceId: PROSPECT_B2B.sources[0]!.sourceId });
    });

    it("contraire : inscrit à la FSMA, ou NACE 66.220 (courtier), ou 65 (assureur) ; cite la source", () => {
      const f = entreprise({ sources: [...PROSPECT_B2B.sources, FSMA] });
      expect(critere(f, "pas_concurrent")).toMatchObject({ statut: "contraire", sourceId: FSMA.sourceId });
      expect(critere(entreprise({ nace: ["66.220"] }), "pas_concurrent")?.statut).toBe("contraire");
      expect(critere(entreprise({ nace: ["65.120"] }), "pas_concurrent")?.statut).toBe("contraire");
    });

    it("sans NACE ni FSMA : non vérifié", () => {
      expect(critere(entreprise({ nace: [] }), "pas_concurrent")).toMatchObject({ statut: "non_verifie", sourceId: null });
    });

    it("un concurrent est écarté : confiance plafonnée à 50 %, non qualifié, même si tout le reste est vérifié ; désactivé, il ne plafonne plus", () => {
      const p = entreprise({ sources: [bce(FAITS_RECENTS), SRC_OSM, SRC_BNB, FSMA] });
      expect(calculerConfiance(p, CTX_COMPLET)).toMatchObject({ plafonnee: true, qualifie: false, valeur: 50 });
      const sans = calculerConfiance(p, { ...CTX_COMPLET, reglages: reglagesSans("pas_concurrent") });
      expect(sans.plafonnee).toBe(false);
      expect(sans.criteres.map((c) => c.code)).not.toContain("pas_concurrent");
    });
  });

  describe("poids normalisés, seuil atteignable, particulier, réglages", () => {
    it("lead parfait : les douze critères vérifiés, 100 %, qualifié ; le contrat de la confiance est respecté", () => {
      const c = calculerConfiance(parfait(), CTX_COMPLET);
      expect(c.criteres).toHaveLength(12);
      expect(c.criteres.every((x) => x.statut === "verifie")).toBe(true);
      expect(c).toMatchObject({ valeur: 100, qualifie: true, plafonnee: false });
      expect(ConfianceQualification.safeParse(c).success).toBe(true);
    });

    it("normalisation : confiance = poids vérifiés / poids actifs ; doubler tous les poids ne change rien", () => {
      // Parfait sans la taille (10 sur 136) : 126 / 136 = 92,6 % arrondi à 93.
      const p = entreprise({ sources: [bce(FAITS_RECENTS), SRC_OSM] });
      expect(calculerConfiance(p, CTX_COMPLET).valeur).toBe(93);
      const doubles = Object.fromEntries(Object.entries(sansLot2.criteres).map(([k, v]) => [k, { actif: v.actif, poids: v.poids * 2 }]));
      const c2 = calculerConfiance(p, { ...CTX_COMPLET, reglages: { ...sansLot2, criteres: doubles as ReglagesQualification["criteres"] } });
      expect(c2.valeur).toBe(93);
      // Un critère courtier sans objet sort du dénominateur : médecin installé depuis longtemps, sans événement = 100 % sur ce qui s'applique.
      const ancien = entreprise({ sources: [bce([{ code: "debut_entreprise", date: "2001-03-01" }, { code: "nouvel_etablissement", date: "2001-03-01" }]), SRC_OSM, SRC_BNB] });
      const ca = calculerConfiance(ancien, CTX_COMPLET);
      expect(ca.criteres.map((c) => c.code)).not.toContain("installation_recente");
      expect(ca.criteres.map((c) => c.code)).not.toContain("evenement_recent");
      expect(ca).toMatchObject({ valeur: 100, qualifie: true });
    });

    it("sans source pour A2 et A3 : non vérifiés, ils pèsent dans le dénominateur (jamais devinés)", () => {
      // Parfait sauf installation (8) et événement (8) : (136 - 16) / 136 = 88,2 % arrondi à 88, sous le seuil.
      const p = entreprise({ sources: [bce(), SRC_OSM, SRC_BNB] });
      expect(calculerConfiance(p, CTX_COMPLET)).toMatchObject({ valeur: 88, qualifie: false });
    });

    it("particulier : aucun critère courtier ni taille ; partenaire : idem", () => {
      const p = Prospect.parse({ ...structuredClone(PROSPECT_B2C), score: null, referentiel: { ...PROSPECT_B2C.referentiel, segments: ["proprietaires"], cibleProspection: null }, zone: { codePostal: "4430", commune: "Ans", province: "Liège", region: "Wallonie", pays: "BE" } });
      const codes = calculerConfiance(p, CTX_COMPLET).criteres.map((c) => c.code);
      for (const n of NOUVEAUX) expect(codes).not.toContain(n);
      expect(codes).toHaveLength(6);
      const part = Prospect.parse({ ...structuredClone(PROSPECT_B2B), cible: "partenaire", statut: "nouveau", score: null, sources: [{ ...SRC_OSM }], basesLegales: [], identifiant: { type: "numero_bce", valeur: PROSPECT_B2B.numeroBce } });
      for (const n of NOUVEAUX) expect(calculerConfiance(part, CTX_COMPLET).criteres.map((c) => c.code)).not.toContain(n);
    });

    it("désactivation par les réglages : le critère sort du calcul et de la liste, le total change", () => {
      const p = entreprise({ sources: [bce(FAITS_RECENTS), SRC_OSM] });
      const c = calculerConfiance(p, { ...CTX_COMPLET, reglages: reglagesSans("assurance_obligatoire_metier", "besoin_offre_active") });
      expect(c.criteres.map((x) => x.code)).not.toContain("assurance_obligatoire_metier");
      expect(c.criteres.map((x) => x.code)).not.toContain("besoin_offre_active");
      // (126 - 20) verifiés sur (136 - 20 - 10 de la taille absente comptée au dénominateur) : 106 / 116... soit (100-10+16) / (136-20).
      expect(c.valeur).toBe(Math.round(((100 - 10 + 16) / (136 - 20)) * 100));
    });

    it("réglages anciens (sept critères d'origine seulement) : les cinq nouveaux restent actifs par défaut", async () => {
      const { reglagesDeVersion } = await import("../src/serveur/services-reglages-leads.js");
      const ancienne = reglagesDeVersion({
        version: 1, seuil: 90, personnalises: [], decidePar: "local-board", decideLe: H,
        criteres: ["entreprise_active", "segment_cible", "zone_cible", "taille_connue", "joignable_legalement", "pas_deja_client", "sources_concordantes"].map((code) => ({ code, actif: true, poids: 10 })) as never,
      });
      for (const n of NOUVEAUX) expect(ancienne.criteres[n]).toEqual({ actif: true, poids: REGLAGES_QUALIFICATION_DEFAUT.criteres[n].poids });
    });

    it("une décision humaine reste possible sur un critère courtier sans objet, et il compte alors", () => {
      const p = entreprise({ nace: ["47.110"] });
      expect(critere(p, "assurance_obligatoire_metier")).toBeUndefined();
      const corrections = new Map([[p.id, [{ code: "assurance_obligatoire_metier", statut: "verifie" as const, auteur: "user-jb", date: "2026-10-16T08:00:00.000Z", justification: "Profession réglementée confirmée au téléphone" }]]]);
      expect(critere(p, "assurance_obligatoire_metier", { ...CTX_COMPLET, corrections })).toMatchObject({ statut: "verifie", source: "humain" });
    });
  });
});

describe("critères courtier du lot 2 : comptes annuels BNB (effectif, flotte, locaux, santé financière)", () => {
  /** Source BNB avec la taille et les rubriques de bilan voulues (codes de rubriques à confirmer sur la documentation BNB). */
  const bnb = (taille: Record<string, unknown>) => ({ ...SRC_BNB, taille: { exercice: 2025, effectifEtp: null, categorie: null, ...taille } });
  const avecBnb = (taille: Record<string, unknown> | null, o: Record<string, unknown> = {}) =>
    entreprise({ sources: [...PROSPECT_B2B.sources, ...(taille === null ? [] : [bnb(taille)])], ...o });
  const critere = (p: Prospect, code: string) => calculerConfiance(p, CTX_TOUS).criteres.find((c) => c.code === code);

  it("poids 6, 4, 4, 6 ; libellés ; entreprises seulement (ni particulier ni partenaire)", () => {
    expect(critere(avecBnb({ effectifEtp: 3 }), "emploie_personnel")).toMatchObject({ poids: 6, libelle: "Emploie du personnel" });
    expect(critere(avecBnb({ terrainsConstructions: 1 }), "proprietaire_locaux")).toMatchObject({ poids: 4, libelle: "Propriétaire de ses locaux" });
    expect(critere(avecBnb({}), "sante_financiere")).toMatchObject({ poids: 6, libelle: "Bonne santé financière" });
    const part = Prospect.parse({ ...structuredClone(PROSPECT_B2B), cible: "partenaire", statut: "nouveau", score: null, sources: [{ ...SRC_OSM }], basesLegales: [], identifiant: { type: "numero_bce", valeur: PROSPECT_B2B.numeroBce } });
    const codes = calculerConfiance(part, CTX_TOUS).criteres.map((c) => c.code);
    for (const n of LOT2) expect(codes).not.toContain(n);
  });

  describe("A4 : emploie du personnel", () => {
    it("vérifié : 12,5 ETP au dernier exercice, source BNB et rubrique citées", () => {
      const c = critere(avecBnb({ effectifEtp: 12.5 }), "emploie_personnel")!;
      expect(c).toMatchObject({ statut: "verifie", sourceId: SRC_BNB.sourceId });
      expect(c.detail).toContain("12,5 équivalents temps plein");
      expect(c.detail).toContain("rubrique 9087");
    });
    it("effectif nul : sans objet, le critère sort du calcul (jamais contraire)", () => {
      expect(critere(avecBnb({ effectifEtp: 0 }), "emploie_personnel")).toBeUndefined();
    });
    it("sans donnée : non vérifié (pas de BNB, ou effectif absent des comptes)", () => {
      expect(critere(avecBnb(null), "emploie_personnel")).toMatchObject({ statut: "non_verifie", sourceId: null });
      expect(critere(avecBnb({ effectifEtp: null }), "emploie_personnel")).toMatchObject({ statut: "non_verifie", sourceId: SRC_BNB.sourceId });
    });
  });

  describe("A5 : flotte probable (estimation)", () => {
    it.each([["43.210", "construction"], ["49.410", "transport"], ["53.200", "livraison"], ["88.101", "soins à domicile"]])("vérifié : NACE %s (%s) et 5 ETP, motif qui dit « estimation »", (n) => {
      const c = critere(avecBnb({ effectifEtp: 5 }, { nace: [n] }), "flotte_probable")!;
      expect(c.statut).toBe("verifie");
      expect(c.detail).toMatch(/Estimation/);
      expect(c.detail).toContain(`NACE ${n}`);
    });
    it("effectif de 4 ETP ou NACE hors liste : sans objet, jamais contraire", () => {
      expect(critere(avecBnb({ effectifEtp: 4.9 }, { nace: ["43.210"] }), "flotte_probable")).toBeUndefined();
      expect(critere(avecBnb({ effectifEtp: 40 }, { nace: ["47.110"] }), "flotte_probable")).toBeUndefined();
      expect(critere(avecBnb({ effectifEtp: 40 }, { nace: ["88.991"] }), "flotte_probable")).toBeUndefined(); // 88.99, pas 88.10
    });
    it("sans donnée : NACE roulante mais effectif inconnu, ou NACE inconnue : non vérifié", () => {
      expect(critere(avecBnb(null, { nace: ["43.210"] }), "flotte_probable")).toMatchObject({ statut: "non_verifie" });
      expect(critere(avecBnb({ effectifEtp: null }, { nace: ["43.210"] }), "flotte_probable")).toMatchObject({ statut: "non_verifie" });
      expect(critere(avecBnb({ effectifEtp: 20 }, { nace: [] }), "flotte_probable")).toMatchObject({ statut: "non_verifie" });
    });
  });

  describe("A6 : propriétaire de ses locaux", () => {
    it("vérifié : terrains et constructions positifs (rubrique 22)", () => {
      const c = critere(avecBnb({ terrainsConstructions: 350000 }), "proprietaire_locaux")!;
      expect(c).toMatchObject({ statut: "verifie", sourceId: SRC_BNB.sourceId });
      expect(c.detail).toContain("rubrique 22");
      expect(c.detail).toContain("350");
    });
    it("terrains à zéro : sans objet (locataire), jamais deviné comme contraire", () => {
      expect(critere(avecBnb({ terrainsConstructions: 0 }), "proprietaire_locaux")).toBeUndefined();
    });
    it("sans donnée : non vérifié (pas de BNB, ou rubrique 22 absente)", () => {
      expect(critere(avecBnb(null), "proprietaire_locaux")).toMatchObject({ statut: "non_verifie", sourceId: null });
      expect(critere(avecBnb({ effectifEtp: 3 }), "proprietaire_locaux")).toMatchObject({ statut: "non_verifie", sourceId: SRC_BNB.sourceId });
    });
  });

  describe("B8 : santé financière", () => {
    const resultats = (a: number | null, b: number | null) => [{ exercice: 2025, resultat: a }, { exercice: 2024, resultat: b }];
    it("vérifié : fonds propres positifs et aucun résultat négatif sur les deux derniers exercices", () => {
      const c = critere(avecBnb({ fondsPropres: 500000, resultats: resultats(42000, 0) }), "sante_financiere")!;
      expect(c).toMatchObject({ statut: "verifie", sourceId: SRC_BNB.sourceId });
      expect(c.detail).toContain("rubrique 10/15");
      expect(c.detail).toContain("2025");
      expect(c.detail).toContain("2024");
    });
    it("contraire : fonds propres négatifs ou nuls, confiance plafonnée à 50 %, lead non qualifié", () => {
      for (const fp of [-1000, 0]) {
        const p = avecBnb({ fondsPropres: fp, resultats: resultats(10, 10) });
        expect(critere(p, "sante_financiere")).toMatchObject({ statut: "contraire", sourceId: SRC_BNB.sourceId });
        expect(calculerConfiance(p, CTX_TOUS)).toMatchObject({ plafonnee: true, qualifie: false });
      }
    });
    it("sans donnée : fonds propres absents, résultat d'un seul exercice, résultat manquant ou exercices non consécutifs : non vérifié", () => {
      expect(critere(avecBnb(null), "sante_financiere")).toMatchObject({ statut: "non_verifie", sourceId: null });
      expect(critere(avecBnb({}), "sante_financiere")).toMatchObject({ statut: "non_verifie" });
      expect(critere(avecBnb({ fondsPropres: 100 }), "sante_financiere")?.statut).toBe("non_verifie");
      expect(critere(avecBnb({ fondsPropres: 100, resultats: [{ exercice: 2025, resultat: 5 }] }), "sante_financiere")?.statut).toBe("non_verifie");
      expect(critere(avecBnb({ fondsPropres: 100, resultats: resultats(5, null) }), "sante_financiere")?.statut).toBe("non_verifie");
      expect(critere(avecBnb({ fondsPropres: 100, resultats: [{ exercice: 2025, resultat: 5 }, { exercice: 2023, resultat: 5 }] }), "sante_financiere")?.statut).toBe("non_verifie");
    });
    it("perte sur l'un des deux exercices : pas vérifié (ni contraire), le détail nomme l'exercice en perte", () => {
      const c = critere(avecBnb({ fondsPropres: 100, resultats: resultats(8000, -3000) }), "sante_financiere")!;
      expect(c.statut).toBe("non_verifie");
      expect(c.detail).toContain("perte sur 2024");
    });
  });

  it("comment vérifier : les quatre critères non vérifiés pointent vers bnb_comptes (flotte : BCE aussi)", () => {
    const p = avecBnb(null, { nace: ["43.210"] });
    const m = criteresManquants(p, calculerConfiance(p, CTX_TOUS)).manquants;
    for (const code of ["emploie_personnel", "proprietaire_locaux", "sante_financiere", "flotte_probable"]) {
      const x = m.find((y) => y.code === code)!;
      expect(x.verifiePar.map((v) => v.outil)).toContain("bnb_comptes");
    }
    expect(m.find((y) => y.code === "flotte_probable")!.verifiePar.map((v) => v.outil)).toContain("bce_entreprise");
  });

  it("lead complet : quinze à seize critères, les quatre vérifiés comptent dans la confiance normalisée", () => {
    const p = avecBnb({ effectifEtp: 12, fondsPropres: 5000, terrainsConstructions: 9000, resultats: [{ exercice: 2025, resultat: 1 }, { exercice: 2024, resultat: 2 }] }, { nace: ["43.210"] });
    const c = calculerConfiance(p, CTX_TOUS);
    for (const n of LOT2) expect(c.criteres.find((x) => x.code === n)?.statut).toBe("verifie");
    expect(ConfianceQualification.safeParse(c).success).toBe(true);
  });
});

describe("critères courtier du lot 3 : bureau spécialisé proche et contact public permis", () => {
  const critere = (p: Prospect, code: string, ctx: ContexteQualification = CTX_TOUS) => calculerConfiance(p, ctx).criteres.find((c) => c.code === code);
  const motif = (m: string) => [{ motif: m, detail: "test", constateLe: H }];

  describe("B11 : bureau spécialisé à moins de 10 km", () => {
    const LIEGE = { lat: 50.6326, lon: 5.5797 };
    /** Bureaux de la fiche du courtier fictif : positions et segments suivis choisis par chaque test. */
    const ctxBureaux = (liege: Record<string, unknown>, ans: Record<string, unknown> = {}): ContexteQualification => ({
      ...CTX_TOUS,
      etablissements: REFERENTIEL_COURTIER.etablissements.map((e) => (e.code === "bureau-liege" ? { ...e, ...liege } : e.code === "bureau-ans" ? { ...e, ...ans } : e)) as never,
    });
    /** Cabinet médical (segment « medecins ») placé `dLat` degrés de latitude au nord du bureau de Liège (0,027° ≈ 3 km). */
    const cabinet = (dLat: number, o: Record<string, unknown> = {}) =>
      entreprise({ zone: { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE", position: { lat: LIEGE.lat + dLat, lon: LIEGE.lon, precision: "exacte" } }, ...o });

    it("poids 6 et libellé ; entreprises seulement (ni particulier ni partenaire)", () => {
      expect(critere(cabinet(0.027), "bureau_specialise_proche")).toMatchObject({ poids: 6, libelle: "Bureau spécialisé à proximité" });
      const codes = (p: Prospect) => calculerConfiance(p, CTX_TOUS).criteres.map((c) => c.code);
      expect(codes(Prospect.parse({ ...structuredClone(PROSPECT_B2C), statut: "nouveau", score: null }))).not.toContain("bureau_specialise_proche");
      const part = Prospect.parse({ ...structuredClone(PROSPECT_B2B), cible: "partenaire", statut: "nouveau", score: null, sources: [{ ...SRC_OSM }], basesLegales: [], identifiant: { type: "numero_bce", valeur: PROSPECT_B2B.numeroBce } });
      expect(codes(part)).not.toContain("bureau_specialise_proche");
      expect(codes(part)).not.toContain("contact_public_permis");
    });

    it("vérifié : bureau qui suit « medecins » à environ 3 km, le détail nomme le bureau et la distance", () => {
      const c = critere(cabinet(0.027), "bureau_specialise_proche", ctxBureaux({ position: LIEGE, segmentsSuivis: ["medecins"] }))!;
      expect(c.statut).toBe("verifie");
      expect(c.detail).toContain("Bureau de Liège (démonstration)");
      expect(c.detail).toMatch(/à 3 km/u);
    });

    it("segment déduit du NACE quand le renvoi du prospect n'en désigne aucun", () => {
      const p = cabinet(0.027, { referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } });
      expect(critere(p, "bureau_specialise_proche", ctxBureaux({ position: LIEGE, segmentsSuivis: ["medecins"] }))?.statut).toBe("verifie");
    });

    it("sans donnée : aucun bureau n'a de segments renseignés (ou liste vide) : non vérifié avec le motif attendu, jamais contraire", () => {
      for (const liege of [{ position: LIEGE }, { position: LIEGE, segmentsSuivis: [] }]) {
        const c = critere(cabinet(0.027), "bureau_specialise_proche", ctxBureaux(liege))!;
        expect(c).toMatchObject({ statut: "non_verifie", sourceId: null, detail: "La fiche du client n'indique pas quel bureau suit quel segment" });
      }
    });

    it("sans donnée : position du prospect inconnue, segment du prospect inconnu : non vérifié", () => {
      const ctx = ctxBureaux({ position: LIEGE, segmentsSuivis: ["medecins"] });
      expect(critere(entreprise(), "bureau_specialise_proche", ctx)).toMatchObject({ statut: "non_verifie" });
      expect(critere(entreprise(), "bureau_specialise_proche", ctx)!.detail).toMatch(/Position du prospect inconnue/u);
      const sansSegment = cabinet(0.027, { nace: [], referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } });
      expect(critere(sansSegment, "bureau_specialise_proche", ctx)).toMatchObject({ statut: "non_verifie" });
      expect(critere(sansSegment, "bureau_specialise_proche", ctx)!.detail).toMatch(/Segment du prospect inconnu/u);
    });

    it("pas contraire : bureau spécialisé à 25 km, bureau d'un autre segment, bureau spécialisé sans position : non vérifié", () => {
      const loin = critere(cabinet(0.225), "bureau_specialise_proche", ctxBureaux({ position: LIEGE, segmentsSuivis: ["medecins"] }))!;
      expect(loin.statut).toBe("non_verifie");
      expect(loin.detail).toMatch(/au-delà du rayon de 10 km/u);
      expect(critere(cabinet(0.027), "bureau_specialise_proche", ctxBureaux({ position: LIEGE, segmentsSuivis: ["avocats"] }))?.statut).toBe("non_verifie");
      expect(critere(cabinet(0.027), "bureau_specialise_proche", ctxBureaux({ segmentsSuivis: ["medecins"] }))?.statut).toBe("non_verifie");
    });

    it("le bureau spécialisé le plus proche est retenu parmi plusieurs, et le rayon exporté vaut 10 km", () => {
      expect(RAYON_ZONE_DEFAUT_KM).toBe(10);
      const c = critere(cabinet(0.027), "bureau_specialise_proche", ctxBureaux({ position: { lat: LIEGE.lat + 0.2, lon: LIEGE.lon }, segmentsSuivis: ["medecins"] }, { position: LIEGE, segmentsSuivis: ["medecins"] }))!;
      expect(c.statut).toBe("verifie");
      expect(c.detail).toContain("Bureau d'Ans (démonstration)");
    });

    it("comment vérifier : l'action demande de renseigner segmentsSuivis", () => {
      const p = cabinet(0.027);
      const x = criteresManquants(p, calculerConfiance(p, CTX_TOUS)).manquants.find((m) => m.code === "bureau_specialise_proche")!;
      expect(x.verifiePar).toEqual([]);
      expect(x.action).toContain("segmentsSuivis");
    });
  });

  describe("C12 : contact professionnel publié et permis", () => {
    const coord = (canal: "telephone" | "courriel", nature: "impersonnelle" | "nominative" | "inconnue") => ({ canal, valeur: PROSPECT_B2B.coordonnees[0]!.valeur, empreinte: PROSPECT_B2B.coordonnees[0]!.empreinte, nature });

    it("poids 6 et libellé ; vaut pour l'entreprise et le particulier", () => {
      expect(critere(entreprise(), "contact_public_permis")).toMatchObject({ poids: 6, libelle: "Contact professionnel publié et permis" });
      expect(critere(Prospect.parse({ ...structuredClone(PROSPECT_B2C), statut: "nouveau", score: null }), "contact_public_permis")).toBeDefined();
    });

    it("entreprise vérifiée : adresse impersonnelle, téléphone ou site lu ; le détail ne cite aucune coordonnée", () => {
      const imper = critere(entreprise(), "contact_public_permis")!;
      expect(imper.statut).toBe("verifie");
      expect(imper.detail).toContain("adresse électronique impersonnelle");
      // Téléphone : il ne compte que si la liste « Ne m'appelez plus » a été consultée à une date connue (voir le test dédié plus bas).
      const tel = { ...structuredClone(PROSPECT_B2B.basesLegales[0]), canal: "telephone", base: "interet_legitime", natureAdresse: "inconnue", dncmVerifieLe: H };
      expect(critere(entreprise({ coordonnees: [coord("telephone", "inconnue")], basesLegales: [tel] }), "contact_public_permis")!.detail).toContain("téléphone");
      const site = entreprise({ coordonnees: [], sources: [...PROSPECT_B2B.sources, { type: "lecture_url", sourceId: null, service: null, outil: null, url: "https://cabinet.example/contact", collecteLe: H }] });
      expect(critere(site, "contact_public_permis")!.detail).toContain("site web");
      expect(imper.detail).not.toMatch(/@|https?:/u);
    });

    it("entreprise : un téléphone seul n'est PAS vérifié tant que la liste « Ne m'appelez plus » n'a pas été consultée (date de vérification absente)", () => {
      const p = entreprise({ coordonnees: [coord("telephone", "inconnue")], basesLegales: [] });
      const c = critere(p, "contact_public_permis")!;
      expect(c.statut).toBe("non_verifie");
      expect(c.detail).toContain("liste « Ne m'appelez plus » n'a pas été consultée");
      expect(c.detail).not.toContain("aucune opposition ni inscription");
    });

    it("entreprise : téléphone avec vérification datée de la liste (dncmVerifieLe) : vérifié, et le détail cite la date", () => {
      const tel = { ...structuredClone(PROSPECT_B2B.basesLegales[0]), canal: "telephone", base: "interet_legitime", natureAdresse: "inconnue", dncmVerifieLe: "2026-10-10T09:00:00.000Z" };
      const c = critere(entreprise({ coordonnees: [coord("telephone", "inconnue")], basesLegales: [tel] }), "contact_public_permis")!;
      expect(c.statut).toBe("verifie");
      expect(c.detail).toContain("liste « Ne m'appelez plus » consultée le 10/10/2026");
    });

    it("entreprise : site lu ou adresse impersonnelle restent acceptés pour l'écrit, même avec un téléphone dont la liste n'a pas été consultée ; le détail ne prétend rien sur la liste", () => {
      const c = critere(entreprise({ coordonnees: [coord("telephone", "inconnue"), coord("courriel", "impersonnelle")], basesLegales: [] }), "contact_public_permis")!;
      expect(c.statut).toBe("verifie");
      expect(c.detail).toBe("Contact professionnel publié dans les sources : adresse électronique impersonnelle ; aucune opposition enregistrée ; téléphone non retenu : la liste « Ne m'appelez plus » n'a pas été consultée");
    });

    it("entreprise : adresse nominative seule (prénom.nom@) : pas un contact publié, non vérifié", () => {
      const c = critere(entreprise({ coordonnees: [coord("courriel", "nominative")] }), "contact_public_permis")!;
      expect(c.statut).toBe("non_verifie");
    });

    it("entreprise contraire : opposition ou liste « Ne m'appelez plus », même avec un contact publié ; plafonne à 50 %", () => {
      for (const [m, texte] of [["opposition_client", "Opposition enregistrée"], ["liste_dncm", "Ne m'appelez plus"]] as const) {
        const p = entreprise({ statut: "exclu", motifsExclusion: motif(m) });
        const c = critere(p, "contact_public_permis")!;
        expect(c.statut).toBe("contraire");
        expect(c.detail).toContain(texte);
        expect(calculerConfiance(p, CTX_TOUS)).toMatchObject({ plafonnee: true, qualifie: false });
      }
    });

    it("entreprise sans donnée : aucune coordonnée ni site : non vérifié", () => {
      const c = critere(entreprise({ coordonnees: [] }), "contact_public_permis")!;
      expect(c.statut).toBe("non_verifie");
      expect(c.detail).toMatch(/Aucun contact professionnel publié/u);
    });

    it("particulier : vérifié seulement avec un consentement documenté non retiré", () => {
      const part = (o: Record<string, unknown> = {}, v: Record<string, unknown> = {}) => Prospect.parse({ ...structuredClone(PROSPECT_B2C), statut: "nouveau", score: null, ...o, particulier: { ...structuredClone(PROSPECT_B2C.particulier), ...v } });
      const ok = critere(part(), "contact_public_permis")!;
      expect(ok.statut).toBe("verifie");
      expect(ok.detail).toContain("Consentement documenté");
      // Consentement retiré : plus rien de documenté (les bases légales qui l'invoquent sont retirées pour rester cohérent).
      const retire = { ...PROSPECT_B2C.particulier.consentements[0]!, retireLe: H };
      expect(critere(part({ basesLegales: [] }, { consentements: [retire] }), "contact_public_permis")?.statut).toBe("non_verifie");
      expect(critere(part({ basesLegales: [] }, { origine: "courrier_adresse", consentements: [] }), "contact_public_permis")?.statut).toBe("non_verifie");
    });

    it("particulier avec opposition ou « Ne m'appelez plus » : jamais vérifié, même avec un consentement", () => {
      const p = Prospect.parse({ ...structuredClone(PROSPECT_B2C), statut: "exclu", score: null, motifsExclusion: motif("opposition_client") });
      expect(critere(p, "contact_public_permis")).toMatchObject({ statut: "non_verifie" });
    });

    it("comment vérifier : entreprise vers osm et bce, particulier vers l'action de documenter le consentement", () => {
      const p = entreprise({ coordonnees: [] });
      const x = criteresManquants(p, calculerConfiance(p, CTX_TOUS)).manquants.find((m) => m.code === "contact_public_permis")!;
      expect(x.verifiePar.map((v) => v.outil)).toEqual(["osm_commerces", "bce_entreprise"]);
      const part = Prospect.parse({ ...structuredClone(PROSPECT_B2C), statut: "nouveau", score: null, basesLegales: [], particulier: { ...structuredClone(PROSPECT_B2C.particulier), consentements: [], origine: "courrier_adresse" } });
      const y = criteresManquants(part, calculerConfiance(part, CTX_TOUS)).manquants.find((m) => m.code === "contact_public_permis")!;
      expect(y.action).toContain("consentement");
    });
  });

  it("arithmétique : lots 1 et 2 gardent leurs attendus (le lot 3 ajoute 12 au dénominateur seulement quand il est actif)", () => {
    const p = entreprise({ sources: [...PROSPECT_B2B.sources, SRC_OSM, SRC_BNB] });
    const sans = calculerConfiance(p, CTX_COMPLET).valeur;
    const avec = calculerConfiance(p, CTX_TOUS);
    // Avec le lot 3 actif, le critère de contact est vérifié (adresse impersonnelle) mais pas celui du bureau (sans segments renseignés) : le numérateur gagne 6, le dénominateur 12.
    expect(avec.criteres.find((c) => c.code === "bureau_specialise_proche")?.statut).toBe("non_verifie");
    expect(avec.criteres.find((c) => c.code === "contact_public_permis")?.statut).toBe("verifie");
    expect(sans).not.toBe(avec.valeur);
    expect(ConfianceQualification.safeParse(avec).success).toBe(true);
  });
});

describe("préfixes NACE : seul le code du prospect doit commencer par le préfixe de la règle", () => {
  it("un code trop court (« 69 », « 86.9 », « 6 », « 4 », « 88.1 ») ne devient ni avocat, ni kinésithérapeute, ni concurrent, ni flotte", () => {
    expect(metierRcParNace("69")).toBeNull();
    expect(metierRcParNace("86.9")).toBeNull();
    expect(naceConcurrent("6")).toBe(false);
    expect(naceFlotte("4")).toBe(false);
    expect(naceFlotte("88.1")).toBe(false);
  });

  it("un code plus précis que la règle reste reconnu (69.101 avocat, 86.906 kiné, 65.120 assureur, 43.210 construction, 88.101 soins)", () => {
    expect(metierRcParNace("69.101")?.libelle).toBe("avocat ou notaire");
    expect(metierRcParNace("86.906")?.libelle).toBe("kinésithérapeute");
    expect(naceConcurrent("65.120")).toBe(true);
    expect(naceFlotte("43.210")).toBe(true);
    expect(naceFlotte("88.101")).toBe(true);
  });

  it("critère « assurance obligatoire » : un NACE « 69 » n'est pas « avocat ou notaire » vérifié", () => {
    const c = calculerConfiance(entreprise({ nace: ["69"] }), CTX_TOUS).criteres.find((x) => x.code === "assurance_obligatoire_metier");
    expect(c?.statut === "verifie" ? c.detail : null).toBeNull();
  });

  it("critère « segment dans la cible » : un NACE « 86 » (trop court) ne vérifie pas un segment 86.210", () => {
    const ctx: ContexteQualification = { ...CTX, segments: [{ code: "medecins", libelle: "Médecins", type: "metier", nace: ["86.210"] }] as never, cibles: [{ ...REFERENTIEL_COURTIER.ciblesProspection[0]!, segments: ["medecins"] }] as never };
    const p = entreprise({ nace: ["86"], referentiel: { ...PROSPECT_B2B.referentiel, segments: [], cibleProspection: null } });
    expect(calculerConfiance(p, ctx).criteres.find((x) => x.code === "segment_cible")?.statut).not.toBe("verifie");
  });
});
