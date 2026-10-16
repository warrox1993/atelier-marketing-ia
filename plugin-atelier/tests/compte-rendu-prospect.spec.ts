/**
 * Compte rendu d'un lead : fonction pure `construireCompteRendu` (aucune IA, rien d'inventé).
 * Données : prospects et courtier fictifs de démonstration (src/contrats/exemples/prospection.ts).
 */
import { describe, expect, it } from "vitest";
import { CompteRenduProspect, Prospect } from "../src/contrats/index.js";
import { PROSPECT_B2B, PROSPECT_B2C, REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import { construireCompteRendu, distanceKm, nomDuProspect, type FicheClientCompteRendu } from "../src/serveur/compte-rendu-prospect.js";
import { calculerConfiance, type ContexteQualification } from "../src/serveur/qualification-prospects.js";

const MAINTENANT = new Date("2026-10-16T10:00:00.000Z");
const fiche = { offres: REFERENTIEL_COURTIER.offres, segments: REFERENTIEL_COURTIER.segments, etablissements: REFERENTIEL_COURTIER.etablissements } as unknown as FicheClientCompteRendu;
const ctx = (o: Partial<ContexteQualification> = {}): ContexteQualification => ({
  cibles: REFERENTIEL_COURTIER.ciblesProspection as never, segments: REFERENTIEL_COURTIER.segments as never, etablissements: REFERENTIEL_COURTIER.etablissements as never,
  baseClientsImportee: true, maintenant: MAINTENANT.toISOString(), ...o,
});
function prospect(brut: unknown, o: Partial<Prospect> = {}, c: Partial<ContexteQualification> = {}): Prospect {
  const p = { ...Prospect.parse(structuredClone(brut)), ...o };
  return { ...p, confiance: calculerConfiance(p, ctx(c)) };
}
const b2b = (o: Partial<Prospect> = {}, c: Partial<ContexteQualification> = {}) => prospect(PROSPECT_B2B, o, c);
const b2c = (o: Partial<Prospect> = {}, c: Partial<ContexteQualification> = {}) => prospect(PROSPECT_B2C, o, c);
const sansTiretCadratin = (s: string) => expect(s).not.toMatch(new RegExp("[\\u2014\\u2013]", "u"));

describe("compte rendu d'un lead", () => {
  it("B2B : critères vérifiés avec source et date, non vérifiés listés, conforme au contrat", () => {
    const p = b2b();
    const cr = construireCompteRendu(p, fiche, MAINTENANT);
    expect(CompteRenduProspect.safeParse(cr).success).toBe(true);
    expect(cr.nom).toBe("Cabinet médical des Coteaux SRL (démonstration)");
    const actif = cr.pourquoi.verifies.find((v) => v.code === "entreprise_active")!;
    expect(actif).toMatchObject({ service: "bce", date: p.sources[0]!.collecteLe });
    expect(actif.source).toContain("BCE");
    expect(cr.pourquoi.verifies.find((v) => v.code === "joignable_legalement")!.date).toBe(p.basesLegales[0]!.verifieLe);
    expect(cr.pourquoi.nonVerifies.map((n) => n.code)).toEqual(expect.arrayContaining(["taille_connue", "sources_concordantes"]));
    expect(cr.pourquoi.contraires).toEqual([]);
    expect(cr.confiance).toMatchObject({ valeur: p.confiance!.valeur, qualifie: p.confiance!.qualifie, seuil: 90 });
  });

  it("la taille connue par les comptes BNB est dite telle quelle ; sans taille portée, le détail reste celui du critère", () => {
    const bnb = (taille?: unknown) => ({ type: "depot_signe", sourceId: "c3333333-3333-4333-8333-333333333333", service: "bnb", outil: "bnb_comptes", url: null, collecteLe: "2026-10-15T10:00:00.000Z", ...(taille ? { taille } : {}) });
    const avec = b2b({ sources: [...PROSPECT_B2B.sources, bnb({ exercice: 2025, effectifEtp: 6, categorie: "petite" })] as never });
    const t = construireCompteRendu(avec, fiche, MAINTENANT).pourquoi.verifies.find((v) => v.code === "taille_connue")!;
    expect(t.detail).toBe("Petite entreprise : 6 personnes, comptes 2025 (Banque nationale)");
    expect(construireCompteRendu(avec, fiche, MAINTENANT).markdown).toContain("Petite entreprise : 6 personnes, comptes 2025 (Banque nationale)");
    const partielle = b2b({ sources: [...PROSPECT_B2B.sources, bnb({ exercice: 2025, effectifEtp: null, categorie: null })] as never });
    expect(construireCompteRendu(partielle, fiche, MAINTENANT).pourquoi.verifies.find((v) => v.code === "taille_connue")!.detail).toBe("comptes 2025 (Banque nationale)");
    const sans = b2b({ sources: [...PROSPECT_B2B.sources, bnb()] as never });
    expect(construireCompteRendu(sans, fiche, MAINTENANT).pourquoi.verifies.find((v) => v.code === "taille_connue")!.detail).toBe("Comptes annuels BNB déposés");
  });

  it("confiance et score restent séparés et une phrase explique la différence", () => {
    const cr = construireCompteRendu(b2b(), fiche, MAINTENANT);
    expect(cr.score).toMatchObject({ valeur: 55, nature: "estimation" });
    expect(cr.score!.libelle).toContain("estimation");
    expect(cr.differenceConfianceScore).toContain(`confiance (${cr.confiance.valeur} %)`);
    expect(cr.differenceConfianceScore).toContain("score (55/100, estimation)");
    expect(cr.differenceConfianceScore).toContain("chance de signer");
    const mesure = construireCompteRendu(b2c(), fiche, MAINTENANT);
    expect(mesure.score).toMatchObject({ valeur: 70, nature: "probabilite_mesuree" });
    expect(mesure.score!.libelle).toBe("18 % de chances (entre 12 et 26 %), mesuré sur 412 dossiers");
    expect(construireCompteRendu(b2b({ score: null }), fiche, MAINTENANT).differenceConfianceScore).toContain("pas encore calculé");
  });

  it("signaux : demande de devis récente pour un particulier ; vide pour une entreprise et pour une demande ancienne", () => {
    const recent = b2c({ sources: [{ ...PROSPECT_B2C.sources[0]!, collecteLe: "2026-10-10T08:00:00.000Z" }] as never });
    expect(construireCompteRendu(recent, fiche, MAINTENANT).signaux).toEqual([
      expect.objectContaining({ code: "demande_recente", date: "2026-10-10T08:00:00.000Z" }),
    ]);
    expect(construireCompteRendu(b2c({ sources: [{ ...PROSPECT_B2C.sources[0]!, collecteLe: "2026-01-10T08:00:00.000Z" }] as never }), fiche, MAINTENANT).signaux).toEqual([]);
    expect(construireCompteRendu(b2b(), fiche, MAINTENANT).signaux).toEqual([]);
  });

  it("offre recommandée : un dentiste OpenStreetMap sans NACE trouve l'offre du segment par sa catégorie", () => {
    const segments = [...REFERENTIEL_COURTIER.segments, { code: "dentistes", libelle: "Dentistes", type: "profession", nace: ["86.230"] }];
    const offres = [...REFERENTIEL_COURTIER.offres, { nom: "RC dentistes", description: "Offre fictive.", confirmee: true, code: "rc-dentistes", cible: "b2b", segments: ["dentistes"], entite: "non-vie" }];
    const f = { ...fiche, segments, offres } as unknown as FicheClientCompteRendu;
    const src = { ...PROSPECT_B2B.sources[0]!, service: "osm", outil: "osm_commerces", categorieOsm: { cle: "amenity", valeur: "dentist" } };
    const p = b2b({ nace: [], sources: [src] as never, referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } as never });
    const r = construireCompteRendu(p, f, MAINTENANT);
    expect(r.offreRecommandee).toMatchObject({ code: "rc-dentistes" });
    expect(r.offreRecommandee!.raison).toContain("catégorie OpenStreetMap « dentiste »");
    sansTiretCadratin(r.offreRecommandee!.raison);
    // Catégorie inconnue : aucune offre, comme avant.
    const inconnue = b2b({ nace: [], sources: [{ ...src, categorieOsm: { cle: "shop", valeur: "bakery" } }] as never, referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } as never });
    expect(construireCompteRendu(inconnue, f, MAINTENANT).offreRecommandee).toBeNull();
  });

  it("offre recommandée : par segment ou NACE, confirmée seulement ; sinon null avec la raison", () => {
    const med = construireCompteRendu(b2b(), fiche, MAINTENANT);
    expect(med.offreRecommandee).toMatchObject({ code: "rc-pro" });
    expect(med.offreRecommandee!.raison).toContain("Médecins");
    expect(med.raisonSansOffre).toBeNull();
    // Par NACE seulement (renvoi sans segment) : avocats = 69.101.
    const parNace = construireCompteRendu(b2b({ nace: ["69.101"], referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } as never }), fiche, MAINTENANT);
    expect(parNace.offreRecommandee).toMatchObject({ code: "rc-pro" });
    expect(parNace.offreRecommandee!.raison).toContain("NACE 69.101");
    // Particulier : l'offre demandée passe avant l'offre du segment.
    const part = construireCompteRendu(b2c(), fiche, MAINTENANT);
    expect(part.offreRecommandee!.code).toBe(PROSPECT_B2C.particulier.offresDemandees[0] ?? part.offreRecommandee!.code);
    // Aucune correspondance.
    const rien = construireCompteRendu(b2b({ nace: ["01.110"], referentiel: { ...PROSPECT_B2B.referentiel, segments: [] } as never }), fiche, MAINTENANT);
    expect(rien.offreRecommandee).toBeNull();
    expect(rien.raisonSansOffre).toContain("segment");
    // Offre non confirmée : jamais recommandée.
    const nonConfirmees = { ...fiche, offres: REFERENTIEL_COURTIER.offres.map((o) => ({ ...o, confirmee: false })) } as never;
    const nc = construireCompteRendu(b2b(), nonConfirmees, MAINTENANT);
    expect(nc.offreRecommandee).toBeNull();
    expect(nc.raisonSansOffre).toContain("non confirmées");
    expect(construireCompteRendu(b2b(), { ...fiche, offres: [] } as never, MAINTENANT).raisonSansOffre).toContain("Aucune offre");
  });

  it("établissement proche : même code postal, puis même commune, sinon null ; haversine si des coordonnées existent", () => {
    expect(construireCompteRendu(b2b(), fiche, MAINTENANT).etablissementProche).toMatchObject({ code: "bureau-liege", raison: "meme_code_postal", distanceKm: null });
    const parCommune = b2b({ zone: { ...PROSPECT_B2B.zone, codePostal: null, commune: "LIEGE" } as never });
    expect(construireCompteRendu(parCommune, fiche, MAINTENANT).etablissementProche).toMatchObject({ code: "bureau-liege", raison: "meme_commune" });
    expect(construireCompteRendu(b2b({ zone: { ...PROSPECT_B2B.zone, codePostal: "1000", commune: "Bruxelles" } as never }), fiche, MAINTENANT).etablissementProche).toBeNull();
    // Coordonnées (non stockées par le schéma actuel, lues défensivement).
    const zone = { ...PROSPECT_B2B.zone, latitude: 50.6326, longitude: 5.5797 } as never;
    const etabs = [
      { nom: "Loin", adresse: null, confirme: true, code: "loin", latitude: 50.8503, longitude: 4.3517 },
      { nom: "Près", adresse: "Rue X 1", confirme: true, code: "pres", latitude: 50.6412, longitude: 5.5718 },
    ];
    const d = construireCompteRendu(b2b({ zone }), { ...fiche, etablissements: etabs } as never, MAINTENANT).etablissementProche!;
    expect(d).toMatchObject({ code: "pres", raison: "distance" });
    expect(d.distanceKm).toBeGreaterThan(0.5);
    expect(d.distanceKm).toBeLessThan(2);
    // Un établissement non confirmé n'est jamais proposé.
    expect(construireCompteRendu(b2b(), { ...fiche, etablissements: REFERENTIEL_COURTIER.etablissements.map((e) => ({ ...e, confirme: false })) } as never, MAINTENANT).etablissementProche).toBeNull();
    expect(Math.round(distanceKm({ latitude: 50.6326, longitude: 5.5797 }, { latitude: 50.8503, longitude: 4.3517 }))).toBe(90);
    expect(distanceKm({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 })).toBe(0);
  });

  it("prochaine action : qualifié et joignable, non qualifié, contraire, exclu", () => {
    const qualifie = b2b({}, {});
    qualifie.confiance = { ...qualifie.confiance!, valeur: 95, qualifie: true };
    const q = construireCompteRendu(qualifie, fiche, MAINTENANT).prochaineAction;
    expect(q).toEqual({ libelle: "Proposer un premier contact par courriel après validation humaine.", canal: "courriel", outils: [] });
    const enrichir = construireCompteRendu(b2b(), fiche, MAINTENANT).prochaineAction;
    expect(enrichir.libelle.startsWith("Enrichir : ")).toBe(true);
    expect(enrichir.outils).toContain("bnb_comptes");
    expect(enrichir.libelle).toContain("bnb_comptes");
    expect(enrichir.canal).toBeNull();
    const exclu = construireCompteRendu(b2b({ statut: "exclu", motifsExclusion: [{ motif: "opposition_client", detail: "x", constateLe: MAINTENANT.toISOString() }] }), fiche, MAINTENANT).prochaineAction;
    expect(exclu.libelle).toContain("Ne pas contacter");
    expect(exclu.libelle).toContain("opposition client");
  });

  it("limites : RGPD toujours, démonstration si le lead l'est, estimation du score ; pas de base légale = pas de contact", () => {
    const l = construireCompteRendu(b2b(), fiche, MAINTENANT).limites;
    expect(l[0]).toContain("RGPD");
    expect(l[0]).toContain("art. 21");
    expect(l[0]).toContain("Aucun contact sans validation humaine");
    expect(l.join(" ")).toContain("Données de démonstration");
    expect(l.join(" ")).toContain("estimation");
    const reel = construireCompteRendu(b2b({ mode: "reel", basesLegales: [] }), fiche, MAINTENANT).limites;
    expect(reel[0]).toContain("aucune base légale vérifiée");
    expect(reel.join(" ")).not.toContain("Données de démonstration");
  });

  it("Markdown : sections, sources datées, aucune coordonnée ni tiret cadratin ; nom d'un particulier = pseudonyme", () => {
    const part = b2c();
    const cr = construireCompteRendu(part, fiche, MAINTENANT);
    expect(nomDuProspect(part)).toBe(PROSPECT_B2C.particulier.pseudonyme);
    for (const titre of ["## Compte rendu du lead", "### Pourquoi ce lead", "### Confiance et score", "### Signaux de moment", "### Offre recommandée", "### Établissement proche", "### Prochaine action", "### Limites"]) {
      expect(cr.markdown).toContain(titre);
    }
    expect(cr.markdown).toContain("- Vérifié :");
    expect(cr.markdown).toMatch(/Source : .*20\d\d-\d\d-\d\d/u);
    expect(cr.markdown).not.toMatch(/@|\+32/u);
    sansTiretCadratin(cr.markdown);
    sansTiretCadratin(JSON.stringify(construireCompteRendu(b2b(), fiche, MAINTENANT)));
  });

  it("refuse un prospect sans confiance calculée", () => {
    const p = Prospect.parse(structuredClone(PROSPECT_B2B));
    expect(() => construireCompteRendu(p, fiche, MAINTENANT)).toThrow(/confiance/u);
  });
});

describe("établissement proche par distance (positions)", () => {
  const etabs = [
    { nom: "Loin", adresse: null, confirme: true, code: "loin", position: { lat: 50.8503, lon: 4.3517 } },
    { nom: "Près", adresse: "Rue X 1", confirme: true, code: "pres", position: { lat: 50.6412, lon: 5.5718 } },
    { nom: "Sans position", adresse: null, confirme: true, code: "sans", position: null },
  ];
  const avecPosition = (precision: "exacte" | "code_postal" | "commune") =>
    b2b({ zone: { ...PROSPECT_B2B.zone, position: { lat: 50.6326, lon: 5.5797, precision } } as never });

  it("choisit par distance, arrondie à 0,1 km, et dit la précision de la position du prospect", () => {
    const cr = construireCompteRendu(avecPosition("code_postal"), { ...fiche, etablissements: etabs } as never, MAINTENANT);
    expect(CompteRenduProspect.safeParse(cr).success).toBe(true);
    const e = cr.etablissementProche!;
    expect(e).toMatchObject({ code: "pres", raison: "distance", precisionPosition: "code_postal" });
    expect(e.distanceKm).toBe(Math.round(e.distanceKm! * 10) / 10);
    expect(e.distanceKm).toBeGreaterThan(0.5);
    expect(e.distanceKm).toBeLessThan(2);
    expect(cr.markdown).toContain("position approximative (centre du code postal)");
    expect(construireCompteRendu(avecPosition("exacte"), { ...fiche, etablissements: etabs } as never, MAINTENANT).markdown).not.toContain("approximative");
  });

  it("sans position côté prospect ou côté établissements : retombe sur le code postal, jamais de distance inventée", () => {
    expect(construireCompteRendu(b2b(), { ...fiche, etablissements: etabs } as never, MAINTENANT).etablissementProche).toBeNull();
    const sansPos = REFERENTIEL_COURTIER.etablissements.map((x) => ({ ...x, position: null }));
    expect(construireCompteRendu(avecPosition("commune"), { ...fiche, etablissements: sansPos } as never, MAINTENANT).etablissementProche).toMatchObject({ raison: "meme_code_postal", distanceKm: null });
  });

  describe("signaux de moment BCE", () => {
    const depot = (collecteLe: string, faits: Array<{ code: string; date: string }>) => ({ ...PROSPECT_B2B.sources[0]!, collecteLe, faits }) as never;
    const avec = (...faits: Array<{ code: string; date: string }>) => b2b({ sources: [PROSPECT_B2B.sources[0]!, depot("2026-10-12T09:00:00.000Z", faits)] as never });

    it("société créée il y a 8 mois : signal creation_recente avec date du fait et source datée du dépôt", () => {
      const cr = construireCompteRendu(avec({ code: "debut_entreprise", date: "2026-02-10" }), fiche, MAINTENANT);
      expect(CompteRenduProspect.safeParse(cr).success).toBe(true);
      expect(cr.signaux).toEqual([{ code: "creation_recente", libelle: "Société créée il y a 8 mois", date: "2026-02-10T00:00:00.000Z", source: "BCE, dépôt du 12/10/2026" }]);
      expect(cr.markdown).toContain("- Société créée il y a 8 mois (BCE). Fait du 10/02/2026, dépôt du 12/10/2026.");
      sansTiretCadratin(cr.markdown);
    });

    it("quatre signaux : création (24 mois), nouvel établissement, déménagement, changement de forme (12 mois)", () => {
      const cr = construireCompteRendu(avec(
        { code: "creation", date: "2025-01-05" }, { code: "nouvel_etablissement", date: "2026-09-02" },
        { code: "changement_adresse", date: "2026-08-20" }, { code: "changement_forme", date: "2026-07-01" },
      ), fiche, MAINTENANT);
      expect(cr.signaux.map((s) => s.code)).toEqual(["creation_recente", "nouvel_etablissement", "demenagement", "changement_forme"]);
      expect(cr.signaux.map((s) => s.libelle)).toEqual(["Société créée il y a 21 mois", "Nouvelle unité d'établissement ouverte il y a 1 mois", "Adresse changée il y a 1 mois", "Forme juridique changée il y a 3 mois"]);
    });

    it("hors fenêtre, daté du futur ou sans donnée : aucun signal", () => {
      expect(construireCompteRendu(avec({ code: "debut_entreprise", date: "2024-03-01" }, { code: "changement_adresse", date: "2025-06-01" }), fiche, MAINTENANT).signaux).toEqual([]);
      expect(construireCompteRendu(avec({ code: "creation", date: "2027-01-01" }), fiche, MAINTENANT).signaux).toEqual([]);
      expect(construireCompteRendu(b2b(), fiche, MAINTENANT).signaux).toEqual([]);
    });

    it("un fait daté du futur plus récent ne masque pas un fait valide plus ancien", () => {
      const cr = construireCompteRendu(avec({ code: "creation", date: "2026-02-10" }, { code: "creation", date: "2027-01-01" }), fiche, MAINTENANT);
      expect(cr.signaux.map((s) => s.code)).toEqual(["creation_recente"]);
      expect(cr.signaux[0]!.date).toBe("2026-02-10T00:00:00.000Z");
    });

    it("moins d'un mois : formulé en clair ; un fait déposé par un autre service que la BCE ne compte pas", () => {
      expect(construireCompteRendu(avec({ code: "creation", date: "2026-10-05" }), fiche, MAINTENANT).signaux[0]!.libelle).toBe("Société créée il y a moins d'un mois");
      const osm = { ...PROSPECT_B2B.sources[0]!, service: "osm", faits: [{ code: "creation", date: "2026-10-05" }] } as never;
      expect(construireCompteRendu(b2b({ sources: [osm] as never }), fiche, MAINTENANT).signaux).toEqual([]);
    });
  });
});
