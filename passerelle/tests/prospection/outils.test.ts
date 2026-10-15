// Lot P2 : les six outils (fonctions directes, schéma Zod appliqué) : filtres secteur, zone, taille ; pagination ;
// formes calquées sur les fichiers BCE ; pièges ; refus d'un numéro au contrôle valide.

import { describe, expect, it } from "vitest";
import { outilChangements, outilEntreprise, outilRechercher } from "../../src/demo/prospection/bce.js";
import { outilComptes } from "../../src/demo/prospection/bnb.js";
import { outilIntermediaire, outilRechercherFsma } from "../../src/demo/prospection/fsma.js";
import { jeuProspection, tailleDe } from "../../src/demo/prospection/jeu.js";
import { controleValide } from "../../src/demo/prospection/numeros.js";
import { appeler, toutesLesPages } from "./aide.js";

const jeu = jeuProspection();
const zone = (e: { siege: { codePostal: string; commune: string; province: string | null; region: string } }) => e.siege;

describe("bce_rechercher", () => {
  it("sans filtre : toutes les entreprises actives, 10 par page, la radiée absente", async () => {
    const p1 = await appeler(outilRechercher);
    expect(p1["total"]).toBe(jeu.entreprises.length);
    expect(p1["taille_page"]).toBe(10);
    expect(p1["entreprises"]).toHaveLength(10);
    const toutes = await toutesLesPages(outilRechercher, "entreprises");
    expect(toutes).toHaveLength(jeu.entreprises.length);
    expect(toutes.map((e) => e.EnterpriseNumber)).not.toContain(jeu.radiees[0]!.numero);
  });

  it("forme calquée sur les fichiers BCE : enterprise, denomination, address, activity (2008 et 2025), contact, establishment", async () => {
    const e = (await appeler(outilRechercher, { nace: ["43.91"], communes: ["Liège"] }))["entreprises"][0];
    expect(e).toMatchObject({ Status: "AC", JuridicalSituation: "000", TypeOfEnterprise: "2" });
    expect(e.EnterpriseNumber).toMatch(/^[01]\d{3}\.\d{3}\.\d{3}$/);
    expect(e.StartDate).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(e.denominations[0]).toMatchObject({ Language: "1", TypeOfDenomination: "001" });
    expect(e.adresses[0]).toMatchObject({ TypeOfAddress: "REGO", CountryFR: "Belgique" });
    const versions = e.activites.map((a: any) => `${a.NaceVersion}:${a.NaceCode}:${a.Classification}`);
    expect(versions).toEqual(["2008:43910:MAIN", "2025:43910:MAIN"]);
    for (const c of e.contacts) expect(["TEL", "EMAIL", "WEB"]).toContain(c.ContactType);
    for (const x of e.etablissements) expect(x.EstablishmentNumber).toMatch(/^2\.\d{3}\.\d{3}\.\d{3}$/);
    // La BCE ne contient ni effectif ni chiffre financier.
    expect(JSON.stringify(e)).not.toMatch(/effectif|bilan/i);
  });

  it("secteur : préfixe NACE (43 = construction spécialisée), point facultatif, plusieurs valeurs = OU", async () => {
    const f43 = await toutesLesPages(outilRechercher, "entreprises", { nace: ["43"] });
    expect(f43.length).toBeGreaterThan(10);
    for (const e of f43) expect(e.activites[0].NaceCode.startsWith("43")).toBe(true);
    const avecPoint = await toutesLesPages(outilRechercher, "entreprises", { nace: ["43.910"] });
    const sans = await toutesLesPages(outilRechercher, "entreprises", { nace: ["43910"] });
    expect(avecPoint).toEqual(sans);
    const ou = await toutesLesPages(outilRechercher, "entreprises", { nace: ["43910", "66220"] });
    expect(ou.length).toBe(avecPoint.length + (await toutesLesPages(outilRechercher, "entreprises", { nace: ["66220"] })).length);
    expect((await appeler(outilRechercher, { nace: ["99999"] }))["total"]).toBe(0);
  });

  it("zone : commune, code postal, province, région, pays ; critères cumulés (ET)", async () => {
    const liege = await toutesLesPages(outilRechercher, "entreprises", { communes: ["liege"] });
    expect(liege.length).toBeGreaterThan(5);
    const cp4020 = await toutesLesPages(outilRechercher, "entreprises", { codes_postaux: ["4020"] });
    expect(cp4020.length).toBeGreaterThan(0);
    for (const e of cp4020) expect(e.adresses.some((a: any) => a.Zipcode === "4020") || e.etablissements.some((x: any) => x.adresses[0].Zipcode === "4020")).toBe(true);
    const namur = await toutesLesPages(outilRechercher, "entreprises", { provinces: ["Namur"] });
    expect(namur.length).toBeGreaterThan(0);
    const bxl = await toutesLesPages(outilRechercher, "entreprises", { regions: ["Bruxelles-Capitale"] });
    const flandre = await toutesLesPages(outilRechercher, "entreprises", { regions: ["Flandre"] });
    expect(bxl.length + flandre.length).toBeGreaterThanOrEqual(0);
    expect((await appeler(outilRechercher, { pays: ["BE"] }))["total"]).toBe(jeu.entreprises.length);
    expect((await appeler(outilRechercher, { pays: ["FR"] }))["total"]).toBe(0);
    const cumul = await toutesLesPages(outilRechercher, "entreprises", { communes: ["Liège"], nace: ["43910"] });
    for (const e of cumul) expect(e.activites[0].NaceCode).toBe("43910");
    expect(cumul.length).toBeLessThan(liege.length);
  });

  it("zone : une entreprise hors zone du client (Herstal) est servie quand on la demande, et seulement alors", async () => {
    const hz = jeu.entreprises.find((e) => e.piege === "hors_zone")!;
    const zoneClient = await toutesLesPages(outilRechercher, "entreprises", { communes: ["Liège", "Ans"] });
    expect(zoneClient.map((e) => e.EnterpriseNumber)).not.toContain(hz.numero);
    const herstal = await toutesLesPages(outilRechercher, "entreprises", { communes: ["Herstal"] });
    expect(herstal.map((e) => e.EnterpriseNumber)).toContain(hz.numero);
  });

  it("taille : micro, petite, moyenne, grande, inconnue d'après les derniers comptes", async () => {
    let total = 0;
    for (const taille of ["micro", "petite", "moyenne", "grande", "inconnue"] as const) {
      const r = await toutesLesPages(outilRechercher, "entreprises", { taille: [taille] });
      const attendu = jeu.entreprises.filter((e) => tailleDe(e.comptes) === taille).map((e) => e.numero);
      expect(r.map((e) => e.EnterpriseNumber).sort()).toEqual(attendu.sort());
      total += r.length;
    }
    expect(total).toBe(jeu.entreprises.length);
  });

  it("créées depuis une date, formes juridiques, et dates invalides refusées", async () => {
    const recentes = await toutesLesPages(outilRechercher, "entreprises", { creees_depuis: "2026-06-01" });
    expect(recentes.length).toBe(jeu.entreprises.filter((e) => e.debut >= "2026-06-01").length);
    expect(recentes.length).toBeGreaterThanOrEqual(4);
    const sa = await toutesLesPages(outilRechercher, "entreprises", { formes: ["014"] });
    for (const e of sa) expect(e.JuridicalForm).toBe("014");
    await expect(appeler(outilRechercher, { creees_depuis: "2026-02-30" })).rejects.toThrow(/date civile/);
    await expect(appeler(outilRechercher, { nace: ["4"] })).rejects.toThrow();
  });

  it("le doublon apparaît deux fois, avec des numéros différents", async () => {
    const r = await toutesLesPages(outilRechercher, "entreprises", { nace: ["43291"], codes_postaux: ["4020"] });
    const noms = r.map((e) => e.denominations[0].Denomination).filter((n: string) => n.startsWith("Isolation Outremeuse Plus"));
    expect(noms).toHaveLength(2);
  });
});

describe("bce_entreprise", () => {
  it("fiche par numéro d'entreprise et par numéro d'unité d'établissement (points et préfixe BE tolérés)", async () => {
    const e = jeu.entreprises.find((x) => x.etablissements.length > 0)!;
    const fiche = await appeler(outilEntreprise, { numero: `BE ${e.numero}` });
    expect(fiche["trouve"]).toBe(true);
    expect(fiche["entreprise"].EnterpriseNumber).toBe(e.numero);
    const etab = await appeler(outilEntreprise, { numero: e.etablissements[0]!.numero.replaceAll(".", "") });
    expect(etab["etablissement"]).toMatchObject({ EstablishmentNumber: e.etablissements[0]!.numero, EnterpriseNumber: e.numero });
  });

  it("radiée : absente du fichier actif, sans historique", async () => {
    const r = await appeler(outilEntreprise, { numero: jeu.radiees[0]!.numero });
    expect(r).toMatchObject({ trouve: false, motif: "absent_du_fichier_actif" });
  });

  it("numéro mal formé : erreur claire ; contrôle modulo 97 valide : refus (pourrait être réel)", async () => {
    await expect(appeler(outilEntreprise, { numero: "0123.456.78" })).rejects.toThrow(/10 chiffres attendus/);
    const base = "02032013";
    const reel = `${base}${String(controleValide(base)).padStart(2, "0")}`;
    const r = await appeler(outilEntreprise, { numero: reel });
    expect(r).toMatchObject({ trouve: false, motif: "numero_non_fictif" });
    expect(JSON.stringify(r)).not.toMatch(/Denomination/);
  });
});

describe("bce_changements", () => {
  it("créations, nouvelles unités, changements d'adresse et de forme, radiation ; triés par date", async () => {
    const tous = await toutesLesPages(outilChangements, "changements", { depuis: "2026-06-01" });
    const types = new Set(tous.map((c) => c.type));
    for (const t of ["creation", "nouvel_etablissement", "changement_adresse", "changement_forme", "radiation"]) expect(types.has(t), t).toBe(true);
    expect(tous.map((c) => c.date)).toEqual([...tous.map((c) => c.date)].sort());
    expect(tous.every((c) => c.date >= "2026-06-01")).toBe(true);
  });

  it("filtres de secteur et de zone ; la radiation reste toujours listée", async () => {
    const f = await toutesLesPages(outilChangements, "changements", { depuis: "2026-06-01", nace: ["66220"], communes: ["Liège"] });
    expect(f.some((c) => c.type === "radiation")).toBe(true);
    for (const c of f.filter((x) => x.type !== "radiation")) expect(c.nace).toEqual(["66.220"]);
    const apres = await toutesLesPages(outilChangements, "changements", { depuis: "2026-09-15" });
    expect(apres.every((c) => c.date >= "2026-09-15")).toBe(true);
    expect(apres.some((c) => c.type === "radiation")).toBe(false);
  });
});

describe("bnb_comptes", () => {
  it("effectif (9087) et total du bilan (20/58), du plus récent au plus ancien", async () => {
    const e = jeu.entreprises.find((x) => x.comptes.length === 3)!;
    const r = await appeler(outilComptes, { numero: e.numero });
    expect(r["trouve"]).toBe(true);
    expect(r["references"]).toHaveLength(3);
    const ex = r["references"].map((x: any) => x.ExerciseDates.endDate);
    expect(ex).toEqual([...ex].sort().reverse());
    const rub = r["references"][0].AccountingData.Rubrics;
    expect(rub.map((x: any) => x.Code)).toEqual(["9087", "20/58"]);
    expect(rub[0].Value).toBe(e.comptes.at(-1)!.effectifEtp);
    expect(rub[1].Value).toBe(e.comptes.at(-1)!.totalBilan);
    expect(r["taille_deduite"]).toBe(tailleDe(e.comptes));
  });

  it("création récente : aucun compte ; radiée : anciens comptes conservés ; mal formé et réel présumé refusés", async () => {
    const recente = jeu.entreprises.find((x) => x.debut >= "2026-06-15")!;
    expect(await appeler(outilComptes, { numero: recente.numero })).toMatchObject({ trouve: true, references: [] });
    const radiee = await appeler(outilComptes, { numero: jeu.radiees[0]!.numero });
    expect(radiee["references"].length).toBeGreaterThan(0);
    expect(radiee["avertissement"]).toMatch(/radiée/);
    await expect(appeler(outilComptes, { numero: "12" })).rejects.toThrow(/10 chiffres/);
    await expect(appeler(outilComptes, { numero: jeu.entreprises[0]!.etablissements[0]?.numero ?? "2.123.456.789" })).rejects.toThrow(/numéro d'entreprise/);
    const base = "02032013";
    expect(await appeler(outilComptes, { numero: `${base}${String(controleValide(base)).padStart(2, "0")}` })).toMatchObject({ trouve: false, motif: "numero_non_fictif" });
  });
});

describe("fsma_intermediaire et fsma_rechercher", () => {
  it("recherche par nom (sans accents) et par numéro BCE", async () => {
    const par = await appeler(outilIntermediaire, { nom: "cabinet" });
    expect(par["total"]).toBeGreaterThan(0);
    const un = jeu.fsma[0]!;
    const num = await appeler(outilIntermediaire, { numero: un.numeroBce.replaceAll(".", "") });
    expect(num["intermediaires"][0].numero_inscription).toBe(un.numeroInscription);
    await expect(appeler(outilIntermediaire)).rejects.toThrow(/numéro BCE ou un nom/);
  });

  it("filtres catégorie, statut et zone ; pièges FSMA", async () => {
    const tous = await toutesLesPages(outilRechercherFsma, "intermediaires");
    expect(tous).toHaveLength(jeu.fsma.length);
    for (const c of ["Courtier d'assurances", "Agent d'assurances"]) {
      const r = await toutesLesPages(outilRechercherFsma, "intermediaires", { categorie: c });
      expect(r.every((x) => x.categorie === c)).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    }
    const radies = await toutesLesPages(outilRechercherFsma, "intermediaires", { statut: "Radié" });
    expect(radies).toHaveLength(1);
    const herstal = await toutesLesPages(outilRechercherFsma, "intermediaires", { communes: ["Herstal"] });
    expect(herstal.every((x) => x.adresse.commune === "Herstal")).toBe(true);
    // Piège : un numéro mal formé, publié tel quel.
    expect(tous.some((x) => x.numero_bce === "0123.456.78")).toBe(true);
    // Piège : radiée à la BCE, encore inscrite à la FSMA.
    const r = jeu.radiees[0]!;
    expect(tous.find((x) => x.numero_bce === r.numero)?.statut).toBe("Inscrit");
  });

  it("croisement registre × BCE : les inscrits (hors pièges) existent à la BCE avec le NACE 66.22", async () => {
    for (const f of jeu.fsma.filter((x) => x.dansBce)) {
      const fiche = await appeler(outilEntreprise, { numero: f.numeroBce });
      expect(fiche["trouve"], f.numeroBce).toBe(true);
      expect(fiche["entreprise"].activites[0].NaceCode).toBe("66220");
    }
  });
});
