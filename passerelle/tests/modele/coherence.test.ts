// Lot L3 : cohérence entre services. Toutes les relations du §6.4 de
// docs/connecteurs-conception.md sont vérifiées sur toute la période du modèle
// (2025 à 2027). Le modèle étant déterministe, chaque vérification exhaustive vaut
// preuve pour les données que les simulateurs serviront.

import { describe, expect, it } from "vitest";
import { datesEntre } from "../../src/demo/modele/calendrier.js";
import {
  CAMPAGNES_ADS, creerModeleDemo, DEBUT_MODELE, DEFINITIONS_CANAUX, ETABLISSEMENTS, FIN_MODELE, LACUNE_GA4, RESEAUX,
  type LigneGa4,
} from "../../src/demo/modele/index.js";

const modele = creerModeleDemo();
const TOUT = { debut: DEBUT_MODELE, fin: FIN_MODELE };
const dates = datesEntre(DEBUT_MODELE, FIN_MODELE);
const dansLacune = (d: string): boolean => d >= LACUNE_GA4.debut && d <= LACUNE_GA4.fin;

const ga4 = modele.ga4(TOUT);
const ads = modele.ads(TOUT);
const fiche = modele.fiche(TOUT);
const publications = modele.publications(TOUT);
const contacts = modele.contacts(TOUT);
const gscGrain = modele.gsc({ ...TOUT, dimensions: ["date", "requete", "page", "etablissement"] });

function somme<T>(lignes: readonly T[], f: (l: T) => number): number {
  return lignes.reduce((s, l) => s + f(l), 0);
}

function grouper<T>(lignes: readonly T[], cle: (l: T) => string): Map<string, T[]> {
  const groupes = new Map<string, T[]>();
  for (const l of lignes) {
    const k = cle(l);
    const g = groupes.get(k);
    if (g) g.push(l);
    else groupes.set(k, [l]);
  }
  return groupes;
}

const sessionsOrganiquesParJour = grouper(ga4.filter((l) => l.canal === "google_organic"), (l) => l.date);
const clicsGscParJour = grouper(gscGrain, (l) => l.cles.date!);

describe("GSC : agrégation cohérente", () => {
  it("le total est la somme des lignes détaillées ; ctr = clics / impressions ; clics ≤ impressions", () => {
    const total = modele.gsc({ ...TOUT, dimensions: [] });
    expect(total).toHaveLength(1);
    expect(total[0]!.clics).toBe(somme(gscGrain, (l) => l.clics));
    expect(total[0]!.impressions).toBe(somme(gscGrain, (l) => l.impressions));
    for (const l of gscGrain) {
      expect(l.clics).toBeLessThanOrEqual(l.impressions);
      expect(l.ctr).toBeCloseTo(l.clics / l.impressions, 12);
    }
    const parRequete = modele.gsc({ ...TOUT, dimensions: ["requete"] });
    expect(somme(parRequete, (l) => l.clics)).toBe(total[0]!.clics);
  });
});

describe("GA4 ≈ GSC × 0,85 à 0,95 (sessions google / organic)", () => {
  it("sur chaque fenêtre de 7 jours hors lacune, toutes zones confondues", () => {
    let fenetres = 0;
    for (let i = 0; i + 7 <= dates.length; i++) {
      const fenetre = dates.slice(i, i + 7);
      if (fenetre.some(dansLacune)) continue;
      const clics = somme(fenetre, (d) => somme(clicsGscParJour.get(d) ?? [], (l) => l.clics));
      const sessions = somme(fenetre, (d) => somme(sessionsOrganiquesParJour.get(d) ?? [], (l) => l.sessions));
      const ratio = sessions / clics;
      expect(ratio, `fenêtre ${fenetre[0]}`).toBeGreaterThanOrEqual(0.85);
      expect(ratio, `fenêtre ${fenetre[0]}`).toBeLessThanOrEqual(0.95);
      fenetres++;
    }
    expect(fenetres).toBeGreaterThan(1000);
  });

  it("chaque mois, pour chaque établissement (hors jours de lacune)", () => {
    for (const etab of ETABLISSEMENTS) {
      const parMois = new Map<string, { clics: number; sessions: number }>();
      for (const l of gscGrain) {
        if (l.cles.etablissement !== etab.id || dansLacune(l.cles.date!)) continue;
        const m = l.cles.date!.slice(0, 7);
        const v = parMois.get(m) ?? { clics: 0, sessions: 0 };
        v.clics += l.clics;
        parMois.set(m, v);
      }
      for (const l of ga4) {
        if (l.canal !== "google_organic" || l.etablissement !== etab.id) continue;
        parMois.get(l.date.slice(0, 7))!.sessions += l.sessions;
      }
      expect(parMois.size).toBe(36);
      for (const [m, v] of parMois) {
        const ratio = v.sessions / v.clics;
        expect(ratio, `${etab.id} ${m}`).toBeGreaterThanOrEqual(0.85);
        expect(ratio, `${etab.id} ${m}`).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

describe("conversions GA4 = contacts CRM de même source", () => {
  it("pour chaque jour, établissement et canal hors lacune : autant de contacts que de demandes de diagnostic", () => {
    const contactsWeb = contacts.filter((c) => c.canal !== "appel_fiche");
    const parCle = grouper(contactsWeb, (c) => `${c.date}|${c.etablissement}|${c.canal}`);
    let verifies = 0;
    for (const l of ga4) {
      const k = `${l.date}|${l.etablissement}|${l.canal}`;
      const lies = parCle.get(k) ?? [];
      expect(lies.length, k).toBe(l.demandesDiagnostic);
      for (const c of lies) expect(c.sourceCrm).toBe(DEFINITIONS_CANAUX[l.canal].sourceCrm);
      parCle.delete(k);
      verifies += l.demandesDiagnostic;
    }
    // Reste : uniquement des contacts créés pendant la lacune GA4 (le formulaire marche, la balise non).
    for (const [k, reste] of parCle) {
      expect(dansLacune(reste[0]!.date), `contact sans conversion GA4 : ${k}`).toBe(true);
    }
    expect(verifies).toBeGreaterThan(1500);
  });

  it("les contacts téléphoniques viennent des appels de la fiche, source OFFLINE", () => {
    const appels = contacts.filter((c) => c.canal === "appel_fiche");
    expect(appels.length).toBeGreaterThan(500);
    const clicsAppel = new Map(fiche.map((f) => [`${f.date}|${f.etablissement}`, f.clicsAppel]));
    for (const [k, lies] of grouper(appels, (c) => `${c.date}|${c.etablissement}`)) {
      expect(lies.every((c) => c.sourceCrm === "OFFLINE")).toBe(true);
      expect(lies.length, k).toBeLessThanOrEqual(clicsAppel.get(k)!);
    }
  });

  it("conversions Ads = demandes de diagnostic GA4 des sessions google / cpc", () => {
    const cpc = new Map(ga4.filter((l) => l.canal === "google_cpc").map((l) => [`${l.date}|${l.etablissement}`, l.demandesDiagnostic]));
    for (const a of ads) expect(a.conversions, `${a.date} ${a.campagne}`).toBe(cpc.get(`${a.date}|${a.etablissement}`) ?? 0);
    expect(somme(ads, (a) => a.conversions)).toBeGreaterThan(0);
  });
});

describe("autres projections entre services", () => {
  it("sessions google / cpc ≤ clics Ads chaque jour, ≥ 85 % sur la campagne, nulles hors campagne", () => {
    const clicsAds = new Map<string, number>();
    for (const a of ads) clicsAds.set(`${a.date}|${a.etablissement}`, (clicsAds.get(`${a.date}|${a.etablissement}`) ?? 0) + a.clics);
    const sessionsCpc = ga4.filter((l) => l.canal === "google_cpc");
    for (const l of sessionsCpc) expect(l.sessions).toBeLessThanOrEqual(clicsAds.get(`${l.date}|${l.etablissement}`) ?? 0);
    expect(somme(sessionsCpc, (l) => l.sessions)).toBeGreaterThanOrEqual(0.85 * somme(ads, (a) => a.clics));
    const debut = CAMPAGNES_ADS[0]!.debut;
    const fin = CAMPAGNES_ADS[0]!.fin;
    expect(sessionsCpc.every((l) => l.date >= debut && l.date <= fin)).toBe(true);
  });

  it("sessions gbp ≤ clics vers le site depuis la fiche, chaque jour et chaque établissement", () => {
    const clicsSite = new Map(fiche.map((f) => [`${f.date}|${f.etablissement}`, f.clicsSite]));
    const gbp = ga4.filter((l) => l.canal === "gbp");
    expect(gbp.length).toBeGreaterThan(1000);
    for (const l of gbp) {
      expect(l.source).toBe("gbp");
      expect(l.sessions).toBeLessThanOrEqual(clicsSite.get(`${l.date}|${l.etablissement}`)!);
    }
  });

  it("sessions sociales ≤ clics des publications du jour, par réseau et établissement", () => {
    const clicsPubs = new Map<string, number>();
    for (const p of publications) clicsPubs.set(`${p.date}|${p.etablissement}|${p.reseau}`, (clicsPubs.get(`${p.date}|${p.etablissement}|${p.reseau}`) ?? 0) + p.clics);
    const sociales = ga4.filter((l) => (RESEAUX as readonly string[]).includes(l.canal));
    expect(sociales.length).toBeGreaterThan(100);
    for (const l of sociales) expect(l.sessions).toBeLessThanOrEqual(clicsPubs.get(`${l.date}|${l.etablissement}|${l.canal}`) ?? 0);
  });

  it("utilisateurs ≤ sessions, sessions engagées ≤ sessions, conversions ≤ sessions", () => {
    for (const l of ga4 as LigneGa4[]) {
      expect(l.utilisateurs).toBeLessThanOrEqual(l.sessions);
      expect(l.sessionsEngagees).toBeLessThanOrEqual(l.sessions);
      expect(l.demandesDiagnostic).toBeLessThanOrEqual(l.sessions);
    }
  });
});

describe("répartition par établissement et par commune", () => {
  it("chaque contact vient d'une localité desservie par son établissement, pour un métier qu'il propose", () => {
    for (const c of contacts) {
      if (c.etablissement === null) continue;
      const etab = ETABLISSEMENTS.find((e) => e.id === c.etablissement)!;
      expect(etab.localites.some((l) => l.nom === c.localite && l.codePostal === c.codePostal && l.commune === c.commune)).toBe(true);
      expect(etab.metiers).toContain(c.metier);
    }
    for (const etab of ETABLISSEMENTS) {
      const communes = new Set(contacts.filter((c) => c.etablissement === etab.id).map((c) => c.localite));
      expect(communes.size, etab.id).toBe(etab.localites.length);
    }
    expect(contacts.some((c) => c.etablissement === "ans" && c.metier === "ventilation")).toBe(false);
  });

  it("Liège-Centre, l'établissement principal, reçoit le plus de demandes ; Ans le moins", () => {
    const parEtab = (id: string) => contacts.filter((c) => c.etablissement === id).length;
    expect(parEtab("liege-centre")).toBeGreaterThan(parEtab("liege-outremeuse"));
    expect(parEtab("liege-outremeuse")).toBeGreaterThan(parEtab("ans"));
  });

  it("les publications ne parlent que des métiers proposés par l'établissement cité", () => {
    for (const p of publications) expect(ETABLISSEMENTS.find((e) => e.id === p.etablissement)!.metiers).toContain(p.metier);
  });
});

describe("transactions CRM", () => {
  it("une transaction par contact arrivé au devis ; issue cohérente avec le cycle de vie", () => {
    const transactions = modele.transactions({ ...TOUT, au: FIN_MODELE });
    expect(transactions.length).toBeGreaterThan(1000);
    const parId = new Map(modele.contacts({ ...TOUT, au: FIN_MODELE }).map((c) => [c.id, c]));
    for (const t of transactions) {
      const c = parId.get(t.contactId)!;
      expect(c.etapes.find((e) => e.etape === "opportunity")?.date).toBe(t.creeLe);
      if (t.etape === "gagne") expect(c.etapes.find((e) => e.etape === "customer")?.date).toBe(t.dateCloture);
      if (t.etape === "perdu") expect(c.etapes.some((e) => e.etape === "customer")).toBe(false);
      if (t.etape === "devis_envoye") expect(t.dateCloture).toBeNull();
    }
  });

  it("l'état dépend de la date d'observation `au`", () => {
    const tot = modele.transactions({ debut: "2026-03-01", fin: "2026-03-31", au: "2026-03-31" });
    const tard = modele.transactions({ debut: "2026-03-01", fin: "2026-03-31", au: "2026-12-31" });
    expect(tard.filter((t) => t.etape !== "devis_envoye").length).toBeGreaterThan(tot.filter((t) => t.etape !== "devis_envoye").length);
    expect(tard.every((t) => t.etape !== "devis_envoye")).toBe(true);
  });
});

describe("saisonnalité visible", () => {
  const impressionsMois = (m: string, metier: string): number =>
    somme(
      modele.gsc({ debut: `${m}-01`, fin: `${m}-28`, dimensions: ["requete"] }).filter((l) => {
        const t = l.cles.requete!;
        return metier === "toiture" ? t.includes("toiture") || t.includes("grenier") : t.includes("ventilation") || t.includes("vmc");
      }),
      (l) => l.impressions,
    );

  it("toiture : pic au printemps et à l'automne, creux en août et en décembre", () => {
    expect(impressionsMois("2026-04", "toiture")).toBeGreaterThan(1.8 * impressionsMois("2026-08", "toiture"));
    expect(impressionsMois("2026-10", "toiture")).toBeGreaterThan(1.5 * impressionsMois("2026-12", "toiture"));
  });

  it("ventilation : plutôt en saison de chauffe", () => {
    expect(impressionsMois("2026-11", "ventilation")).toBeGreaterThan(impressionsMois("2026-06", "ventilation"));
  });

  it("moins de recherches le week-end ; fiche d'Ans le samedi, pas Liège-Centre", () => {
    const parJour = modele.gsc({ debut: "2026-01-05", fin: "2026-12-27", dimensions: ["date"] });
    const semaine = parJour.filter((l) => [1, 2, 3, 4, 5].includes(new Date(l.cles.date!).getUTCDay()));
    const weekend = parJour.filter((l) => [0, 6].includes(new Date(l.cles.date!).getUTCDay()));
    expect(somme(semaine, (l) => l.impressions) / semaine.length).toBeGreaterThan(1.2 * (somme(weekend, (l) => l.impressions) / weekend.length));
    const samedis = fiche.filter((f) => new Date(f.date).getUTCDay() === 6);
    const appelsSamedi = (id: string) => somme(samedis.filter((f) => f.etablissement === id), (f) => f.clicsAppel);
    expect(appelsSamedi("ans")).toBeGreaterThan(2 * appelsSamedi("liege-centre"));
  });
});
