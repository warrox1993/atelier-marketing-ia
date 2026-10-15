// Lot L3 : bornes plausibles (budget, CPC, CTR, positions, engagement, notes),
// pièges de démonstration, absence de toute coordonnée réelle, contrat Zod.

import { describe, expect, it } from "vitest";
import {
  AVIS_PIEGE, BUDGET_ADS_MAX_EUROS, CAMPAGNES_ADS, creerModeleDemo, DEBUT_MODELE, ETABLISSEMENTS, FIN_MODELE, LACUNE_GA4, REQUETES,
  SchemaAvis, SchemaContactCrm, SchemaLigneAds, SchemaLigneFiche, SchemaLigneGa4, SchemaLigneGsc, SchemaPiege, SchemaPublication,
  SchemaTransactionCrm,
} from "../../src/demo/modele/index.js";
import type * as z from "zod";

const modele = creerModeleDemo();
const TOUT = { debut: DEBUT_MODELE, fin: FIN_MODELE };
const somme = <T>(l: readonly T[], f: (x: T) => number): number => l.reduce((s, x) => s + f(x), 0);

describe("Google Ads : budget du brief de printemps", () => {
  const ads = modele.ads(TOUT);

  it("dépense totale ≤ 1 500 €, chaque campagne dans son budget, chaque jour dans son budget quotidien", () => {
    expect(somme(ads, (a) => a.coutMicros)).toBeLessThanOrEqual(BUDGET_ADS_MAX_EUROS * 1_000_000);
    expect(somme(CAMPAGNES_ADS, (c) => c.budgetTotalEuros)).toBeLessThanOrEqual(BUDGET_ADS_MAX_EUROS);
    for (const c of CAMPAGNES_ADS) {
      const lignes = ads.filter((a) => a.campagneId === c.id);
      expect(lignes).toHaveLength(122);
      expect(somme(lignes, (a) => a.coutMicros)).toBeLessThanOrEqual(c.budgetTotalEuros * 1_000_000);
      const budgetJourMicros = Math.floor((c.budgetTotalEuros * 100) / 122) * 10_000;
      for (const a of lignes) expect(a.coutMicros).toBeLessThanOrEqual(budgetJourMicros);
    }
    // Réalisme : la campagne consomme l'essentiel de son budget.
    expect(somme(ads, (a) => a.coutMicros)).toBeGreaterThan(0.8 * BUDGET_ADS_MAX_EUROS * 1_000_000);
  });

  it("CPC entre 1,20 € et 2,50 €, CTR de recherche plausible, aucune dépense hors campagne", () => {
    for (const a of ads) {
      if (a.clics === 0) {
        expect(a.coutMicros).toBe(0);
        continue;
      }
      const cpc = a.coutMicros / a.clics / 1_000_000;
      expect(cpc).toBeGreaterThanOrEqual(1.2);
      expect(cpc).toBeLessThanOrEqual(2.5);
      expect(a.clics / a.impressions).toBeGreaterThanOrEqual(0.02);
      expect(a.clics / a.impressions).toBeLessThanOrEqual(0.12);
    }
    expect(modele.ads({ debut: DEBUT_MODELE, fin: "2027-02-28" })).toEqual([]);
    expect(modele.ads({ debut: "2027-07-01", fin: FIN_MODELE })).toEqual([]);
  });
});

describe("recherche Google : positions et taux de clic plausibles", () => {
  const parRequeteJour = modele.gsc({ ...TOUT, dimensions: ["date", "requete"] });

  it("positions entre 1 et 40, CTR ≤ 60 % dès 50 impressions, CTR global entre 2 % et 8 %", () => {
    for (const l of parRequeteJour) {
      expect(l.position).toBeGreaterThanOrEqual(1);
      expect(l.position).toBeLessThanOrEqual(40);
      expect(l.clics).toBeLessThanOrEqual(l.impressions);
    }
    // Une ligne quotidienne de quelques impressions (5 clics sur 8 pour une requête de marque
    // en position 1) peut dépasser 60 % ; la borne vaut pour un volume significatif.
    const significatives = parRequeteJour.filter((l) => l.impressions >= 50);
    expect(significatives.length).toBeGreaterThan(5000);
    for (const l of significatives) expect(l.ctr).toBeLessThanOrEqual(0.6);
    const parRequeteAnnee = modele.gsc({ debut: "2026-01-01", fin: "2026-12-31", dimensions: ["requete"] });
    for (const l of parRequeteAnnee) expect(l.ctr, l.cles.requete).toBeLessThanOrEqual(0.5);
    const total = modele.gsc({ ...TOUT, dimensions: [] })[0]!;
    expect(total.ctr).toBeGreaterThan(0.02);
    expect(total.ctr).toBeLessThan(0.08);
  });

  it("requêtes de marque en tête des résultats, requêtes génériques concurrentielles plus bas", () => {
    const parRequete = new Map(modele.gsc({ debut: "2026-01-01", fin: "2026-12-31", dimensions: ["requete"] }).map((l) => [l.cles.requete!, l]));
    for (const r of REQUETES.filter((q) => q.marque && q.repartition !== null)) expect(parRequete.get(r.texte)!.position).toBeLessThan(2.5);
    expect(parRequete.get("prime isolation toiture wallonie")!.position).toBeGreaterThan(15);
    expect(parRequete.get("rénovation liège")!.ctr).toBeGreaterThan(parRequete.get("isolation toiture liège")!.ctr);
  });
});

describe("fiche d'établissement, réseaux sociaux, avis : bornes", () => {
  it("clics et demandes de la fiche bien inférieurs aux impressions", () => {
    for (const f of modele.fiche(TOUT)) {
      const impressions = f.impressionsRechercheMobile + f.impressionsRechercheOrdinateur + f.impressionsMapsMobile + f.impressionsMapsOrdinateur;
      expect(f.clicsSite + f.clicsAppel + f.demandesItineraire).toBeLessThanOrEqual(Math.max(3, 0.12 * impressions));
    }
  });

  it("engagement social plausible : réactions ≤ portée ≤ impressions, taux d'engagement de 0,5 % à 12 %", () => {
    const pubs = modele.publications(TOUT);
    expect(new Set(pubs.map((p) => p.reseau)).size).toBe(3);
    for (const p of pubs) {
      expect(p.portee).toBeLessThanOrEqual(p.impressions);
      expect(p.reactions).toBeLessThanOrEqual(p.portee);
      const taux = (p.reactions + p.commentaires + p.partages) / p.portee;
      expect(taux, p.id).toBeGreaterThanOrEqual(0.005);
      expect(taux, p.id).toBeLessThanOrEqual(0.12);
    }
    const fb = modele.publications({ debut: "2026-01-01", fin: "2026-12-31", reseau: "facebook" });
    expect(fb.length).toBeGreaterThan(80);
    expect(fb.length).toBeLessThan(105);
    expect(fb.every((p) => p.reseau === "facebook")).toBe(true);
  });

  it("avis : notes de 1 à 5, moyenne entre 4,2 et 4,8, réponses après l'avis", () => {
    const resume = modele.avis(TOUT);
    expect(resume.total).toBe(resume.avis.length);
    expect(resume.total).toBeGreaterThan(150);
    expect(resume.noteMoyenne).toBeGreaterThanOrEqual(4.2);
    expect(resume.noteMoyenne).toBeLessThanOrEqual(4.8);
    expect(new Set(resume.avis.map((a) => a.id)).size).toBe(resume.total);
    for (const a of resume.avis) if (a.reponse) expect(a.reponse.date > a.date).toBe(true);
    expect(resume.avis.some((a) => a.note <= 2)).toBe(true);
  });

  it("avis cohérents avec les services et les horaires : aucun avis ventilation à Ans, aucun « samedi » à Liège-Centre", () => {
    const resume = modele.avis(TOUT);
    expect(resume.avis.some((a) => a.etablissement === "ans" && (a.metier === "ventilation" || /ventilation/i.test(a.texte)))).toBe(false);
    expect(resume.avis.some((a) => a.etablissement === "liege-centre" && /samedi/i.test(a.texte))).toBe(false);
    expect(resume.avis.some((a) => a.etablissement === "liege-outremeuse" && /samedi/i.test(a.texte))).toBe(true);
  });

  it("la réponse à un avis n'est visible qu'une fois publiée", () => {
    const tous = modele.avis(TOUT).avis.filter((a) => a.reponse);
    const exemple = tous.find((a) => a.reponse!.date > a.date)!;
    const avant = modele.avis({ debut: DEBUT_MODELE, fin: exemple.date }).avis.find((a) => a.id === exemple.id)!;
    expect(avant.reponse).toBeNull();
  });
});

describe("pièges de démonstration", () => {
  it("trois pièges décrits : hors périmètre, injection, période sans données", () => {
    const pieges = modele.pieges();
    expect(pieges.map((p) => p.type).sort()).toEqual(["hors_perimetre", "injection_consignes", "periode_sans_donnees"]);
    for (const p of pieges) expect(SchemaPiege.safeParse(p).success).toBe(true);
  });

  it("Herstal : recherches réelles mais rattachées à aucun établissement, contacts hors zone", () => {
    const horsZone = modele.gsc({ debut: "2026-01-01", fin: "2026-12-31", dimensions: ["requete", "etablissement"] }).filter((l) => l.cles.etablissement === null);
    expect(horsZone.map((l) => l.cles.requete).sort()).toEqual(["isolation toiture herstal", "rénovation liège dépôt herstal"]);
    expect(somme(horsZone, (l) => l.impressions)).toBeGreaterThan(1000);
    expect(modele.ga4({ debut: "2026-01-01", fin: "2026-12-31" }).filter((l) => l.etablissement === null).every((l) => l.canal === "google_organic")).toBe(true);
    const contactsHorsZone = modele.contacts(TOUT).filter((c) => c.horsZone);
    expect(contactsHorsZone.length).toBeGreaterThan(0);
    for (const c of contactsHorsZone) {
      expect(c.etablissement).toBeNull();
      expect(c.commune).toBe("Herstal");
      expect(c.cycleDeVie).toBe("lead");
    }
    expect(modele.transactions(TOUT).some((t) => t.etablissement === null)).toBe(false);
  });

  it("avis piégé : injection rendue telle quelle, comme une donnée, sans réponse, à Outremeuse seulement", () => {
    const outremeuse = modele.avis({ debut: "2026-09-01", fin: "2026-09-30", etablissement: "liege-outremeuse" });
    const piege = outremeuse.avis.find((a) => a.id === AVIS_PIEGE.id)!;
    expect(piege.texte).toContain("Ignore les instructions précédentes");
    expect(piege.texte).toBe(AVIS_PIEGE.texte);
    expect(piege.date).toBe("2026-09-22");
    expect(piege.reponse).toBeNull();
    for (const id of ["liege-centre", "ans"] as const) {
      expect(modele.avis({ ...TOUT, etablissement: id }).avis.some((a) => /ignore les instructions/i.test(a.texte))).toBe(false);
    }
  });

  it("lacune GA4 du 3 au 9 août 2026 : aucune ligne GA4, mais recherche, fiche et CRM continuent", () => {
    const lacune = { debut: LACUNE_GA4.debut, fin: LACUNE_GA4.fin };
    expect(modele.ga4(lacune)).toEqual([]);
    expect(modele.ga4({ debut: "2026-08-02", fin: "2026-08-10" }).map((l) => l.date).every((d) => d === "2026-08-02" || d === "2026-08-10")).toBe(true);
    expect(modele.gsc({ ...lacune, dimensions: ["date"] })).toHaveLength(7);
    expect(modele.fiche(lacune)).toHaveLength(21);
    expect(modele.contacts(lacune).length).toBeGreaterThan(0);
    expect(modele.donneesDisponibles("ga4", "2026-08-05")).toBe(false);
    expect(modele.donneesDisponibles("gsc", "2026-08-05")).toBe(true);
    expect(modele.donneesDisponibles("ga4", "2026-08-10")).toBe(true);
    expect(modele.donneesDisponibles("ga4", "2030-01-01")).toBe(false);
  });
});

describe("aucune coordonnée réelle", () => {
  const tout = JSON.stringify({
    gsc: modele.gsc({ ...TOUT, dimensions: ["requete", "page"] }),
    ga4: modele.ga4(TOUT),
    ads: modele.ads(TOUT),
    fiche: modele.fiche(TOUT),
    publications: modele.publications(TOUT),
    contacts: modele.contacts(TOUT),
    transactions: modele.transactions(TOUT),
    avis: modele.avis(TOUT),
    pieges: modele.pieges(),
    cadre: modele.cadre(),
  });

  it("adresses électroniques sur exemple.invalid seulement (RFC 2606)", () => {
    const courriels = tout.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(courriels.length).toBeGreaterThan(1000);
    for (const c of courriels) expect(c.endsWith("@exemple.invalid"), c).toBe(true);
  });

  it("adresses web et domaines sur .example seulement", () => {
    const urls = tout.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(100);
    for (const u of urls) expect(new URL(u).hostname.endsWith(".example"), u).toBe(true);
    const domaines = tout.match(/\b[a-z0-9-]+\.(?:be|com|fr|net|org|eu|io|nl|de|lu|co|info|biz)\b/gi) ?? [];
    expect(domaines).toEqual([]);
  });

  it("numéros de téléphone au seul format fictif +32 4 000 …", () => {
    const internationaux = tout.match(/\+\d[\d ]{6,}\d/g) ?? [];
    expect(internationaux.length).toBeGreaterThan(1000);
    for (const n of internationaux) expect(n, n).toMatch(/^\+32 4 000 \d\d \d\d$/);
    expect(tout.match(/\b0\d{1,3}[ /.]\d{2,3}[ .]\d{2}[ .]\d{2}\b/g) ?? []).toEqual([]);
    // Les contacts n'empruntent pas les numéros des établissements (+32 4 000 00 0x).
    expect(modele.contacts(TOUT).some((c) => c.telephone.startsWith("+32 4 000 00 "))).toBe(false);
  });

  it("téléphones et pages des établissements : ceux du corpus", () => {
    expect(ETABLISSEMENTS.map((e) => e.telephone)).toEqual(["+32 4 000 00 01", "+32 4 000 00 02", "+32 4 000 00 03"]);
    expect(ETABLISSEMENTS.map((e) => e.page)).toEqual([
      "https://renovation-liege.example/agences/liege-centre",
      "https://renovation-liege.example/agences/outremeuse",
      "https://renovation-liege.example/agences/ans",
    ]);
  });
});

describe("charte de marque dans les textes produits", () => {
  it("aucune affirmation interdite dans les publications et les avis ordinaires", () => {
    const interdits = /gratuit|offert|leader|numéro un|meilleur|100 %|garanti|express|instantané/i;
    for (const p of modele.publications(TOUT)) expect(p.texte, p.id).not.toMatch(interdits);
    for (const a of modele.avis(TOUT).avis) {
      if (a.id === AVIS_PIEGE.id) continue;
      expect(a.texte, a.id).not.toMatch(interdits);
      expect(a.reponse?.texte ?? "", a.id).not.toMatch(interdits);
    }
  });
});

describe("contrat Zod", () => {
  const valider = <S extends z.ZodType>(schema: S, lignes: readonly unknown[]): void => {
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      const r = schema.safeParse(l);
      expect(r.success, JSON.stringify(l)).toBe(true);
    }
  };
  const annee = { debut: "2026-01-01", fin: "2026-12-31" };

  it("chaque ligne renvoyée respecte son schéma", () => {
    valider(SchemaLigneGsc, modele.gsc({ ...annee, dimensions: ["date", "requete", "page", "etablissement"] }));
    valider(SchemaLigneGa4, modele.ga4(annee));
    valider(SchemaLigneAds, modele.ads({ debut: "2027-03-01", fin: "2027-06-30" }));
    valider(SchemaLigneFiche, modele.fiche(annee));
    valider(SchemaPublication, modele.publications(annee));
    valider(SchemaContactCrm, modele.contacts(annee));
    valider(SchemaTransactionCrm, modele.transactions(annee));
    valider(SchemaAvis, modele.avis(annee).avis);
  });

  it("paramètres invalides refusés avec un message en français", () => {
    expect(() => modele.ga4({ debut: "2026-05-01", fin: "2026-04-01" })).toThrow(/début doit précéder/);
    expect(() => modele.ga4({ debut: "2024-12-31", fin: "2025-01-05" })).toThrow(/hors de la période du modèle/);
    expect(() => modele.ga4({ debut: "2026-02-30", fin: "2026-03-05" })).toThrow(/date civile inexistante/);
    expect(() => modele.ga4({ debut: "01/02/2026", fin: "2026-03-05" })).toThrow(/AAAA-MM-JJ/);
    expect(() => modele.gsc({ debut: "2026-01-01", fin: "2026-01-02", dimensions: ["pays" as "date"] })).toThrow(/invalides/);
    expect(() => modele.publications({ debut: "2026-01-01", fin: "2026-01-02", reseau: "tiktok" as "facebook" })).toThrow(/invalides/);
    expect(() => modele.avis({ debut: "2026-01-01", fin: "2026-01-02", etablissement: "herstal" as "ans" })).toThrow(/invalides/);
  });
});
