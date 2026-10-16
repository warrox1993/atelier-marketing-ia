// Lot P3 : les trois outils `bce_*` du fournisseur réel, sur un index construit à partir de fichiers de test au format
// officiel (entreprises fictives) : fichier complet n° 133 puis mise à jour n° 134.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OutilPasserelle } from "../../src/fournisseurs.js";
import { appliquerMiseAJour, importerComplet } from "../../src/reel/prospection/bce/importer.js";
import { IndexBce } from "../../src/reel/prospection/bce/index.js";
import { NOTE_TAILLE, outilsBce } from "../../src/reel/prospection/bce/outils.js";
import { controleValide, formaterNumero } from "../../src/commun/prospection/numeros.js";
import { appeler, N, E, NOM_PERSONNE_PHYSIQUE, csv, dossierTemporaire, ecrireZip, fichierComplet, miseAJour134, numeroFictif } from "./aide-bce.js";

const numeros = (r: Record<string, any>): string[] => (r["entreprises"] as any[]).map((e) => e.EnterpriseNumber).sort();

describe("outils bce réels", () => {
  let index: IndexBce;
  let outils: OutilPasserelle[];

  beforeAll(async () => {
    const dossier = dossierTemporaire();
    const chemin = join(dossier, "bce.sqlite");
    await importerComplet(ecrireZip(dossier, "KboOpenData_0133_2026_10_Full.zip", fichierComplet()), chemin);
    await appliquerMiseAJour(ecrireZip(dossier, "KboOpenData_0134_2026_10_Update.zip", miseAJour134()), chemin);
    index = new IndexBce(chemin);
    outils = outilsBce(() => index);
  });
  afterAll(() => index.fermer());

  it("catalogue : trois outils, tous en lecture seule, mêmes noms qu'en démonstration", () => {
    expect(outils.map((o) => o.nom)).toEqual(["bce_rechercher", "bce_entreprise", "bce_changements"]);
    for (const o of outils) expect(o.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("bce_rechercher : secteur (préfixe, point facultatif, versions 2008 et 2025)", async () => {
    expect(numeros(await appeler(outils, "bce_rechercher", { nace: ["43.91"] }))).toEqual([N.toitures, N.couvreurNamur].sort());
    expect(numeros(await appeler(outils, "bce_rechercher", { nace: ["43"] }))).toEqual([N.toitures, N.couvreurNamur].sort());
    expect(numeros(await appeler(outils, "bce_rechercher", { nace: ["43910", "56101"] }))).toEqual([N.toitures, N.couvreurNamur, N.brasserie, N.nouvelle].sort());
    expect((await appeler(outils, "bce_rechercher", { nace: ["99999"] }))["total"]).toBe(0);
  });

  it("bce_rechercher : zone (commune sans accent, siège OU établissement, code postal, province, région, pays)", async () => {
    expect(numeros(await appeler(outils, "bce_rechercher", { communes: ["liege"] }))).toEqual([N.brasserie]);
    // `toitures` a déménagé à Seraing mais garde un établissement à Ans.
    expect(numeros(await appeler(outils, "bce_rechercher", { communes: ["Ans"] }))).toEqual([N.toitures]);
    expect(numeros(await appeler(outils, "bce_rechercher", { codes_postaux: ["4100"] }))).toEqual([N.toitures, N.nouvelle].sort());
    expect(numeros(await appeler(outils, "bce_rechercher", { provinces: ["Namur"] }))).toEqual([N.couvreurNamur]);
    expect(numeros(await appeler(outils, "bce_rechercher", { provinces: ["liège"] }))).toEqual([N.toitures, N.brasserie, N.nouvelle].sort());
    expect(numeros(await appeler(outils, "bce_rechercher", { pays: ["FR"] }))).toEqual([N.etrangere]);
    const wallonie = numeros(await appeler(outils, "bce_rechercher", { regions: ["Wallonie"] }));
    expect(wallonie).not.toContain(N.etrangere);
    expect(wallonie).toContain(N.couvreurNamur);
    expect((await appeler(outils, "bce_rechercher", { regions: ["Flandre"] }))["total"]).toBe(0);
  });

  it("bce_rechercher : critères cumulés (ET) sur la même adresse, forme juridique, date de début", async () => {
    expect(numeros(await appeler(outils, "bce_rechercher", { nace: ["43"], regions: ["Wallonie"], provinces: ["Namur"] }))).toEqual([N.couvreurNamur]);
    expect((await appeler(outils, "bce_rechercher", { nace: ["56"], provinces: ["Namur"] }))["total"]).toBe(0);
    expect((await appeler(outils, "bce_rechercher", { formes: ["014"] }))["total"]).toBe(0); // la brasserie est passée en SRL
    expect(numeros(await appeler(outils, "bce_rechercher", { formes: ["610"], creees_depuis: "2024-01-01" }))).toEqual([N.brasserie, N.nouvelle].sort());
    await expect(appeler(outils, "bce_rechercher", { creees_depuis: "2024-13-01" })).rejects.toThrow(/creees_depuis invalide/);
  });

  it("bce_rechercher : la taille vaut « inconnue » sans données BNB, et la réponse le dit", async () => {
    const sans = await appeler(outils, "bce_rechercher", {});
    expect(sans["taille_note"]).toBe(NOTE_TAILLE);
    expect(sans["total"]).toBe(5);
    const inconnue = await appeler(outils, "bce_rechercher", { taille: ["inconnue"] });
    expect(inconnue["total"]).toBe(5);
    for (const t of [["micro"], ["petite", "moyenne"], ["grande"]] as const) {
      const r = await appeler(outils, "bce_rechercher", { taille: t });
      expect(r["total"], t.join()).toBe(0);
      expect(r["taille_note"]).toBe(NOTE_TAILLE);
    }
    expect((await appeler(outils, "bce_rechercher", { taille: ["micro", "inconnue"] }))["total"]).toBe(5);
  });

  it("bce_rechercher : aucune personne physique, jamais, quel que soit le filtre", async () => {
    const tout = JSON.stringify(await appeler(outils, "bce_rechercher", {}));
    expect(tout).not.toContain(NOM_PERSONNE_PHYSIQUE);
    expect(numeros(await appeler(outils, "bce_rechercher", { communes: ["Liège"], nace: ["43"] }))).not.toContain(N.personnePhysique);
    expect((await appeler(outils, "bce_entreprise", { numero: N.personnePhysique }))["trouve"]).toBe(false);
    expect((await appeler(outils, "bce_entreprise", { numero: E.secretPhysique }))["trouve"]).toBe(false);
  });

  it("bce_rechercher : forme des fichiers BCE (entité complète), contexte et source datée", async () => {
    const r = await appeler(outils, "bce_rechercher", { nace: ["43.91"], communes: ["Ans"] });
    expect(r["source"]).toContain("15-10-2026");
    expect(r["date_extraction"]).toBe("2026-10-15");
    expect(r["conditions"]).toMatch(/personnes physiques/);
    const e = r["entreprises"][0];
    expect(e).toMatchObject({ EnterpriseNumber: N.toitures, Status: "AC", TypeOfEnterprise: "2", JuridicalForm: "610", JuridicalFormLibelle: "Société à responsabilité limitée", StartDate: "15-03-2019" });
    expect(e.denominations).toContainEqual({ Language: "1", TypeOfDenomination: "001", Denomination: "Toitures Fictives SRL" });
    expect(e.adresses[0]).toMatchObject({ TypeOfAddress: "REGO", Zipcode: "4100", MunicipalityFR: "Seraing" });
    expect(e.activites.map((a: any) => `${a.NaceVersion}:${a.NaceCode}:${a.Classification}:${a.Libelle}`)).toEqual(["2008:43910:MAIN:Travaux de couverture", "2025:43910:MAIN:Travaux de couverture (2025)"]);
    expect(e.contacts.map((c: any) => c.ContactType)).toEqual(["EMAIL", "TEL", "WEB"]);
    expect(e.etablissements).toHaveLength(1);
    expect(e.etablissements[0]).toMatchObject({ EstablishmentNumber: E.toituresAns, EnterpriseNumber: N.toitures });
    expect(e.etablissements[0].adresses[0]).toMatchObject({ TypeOfAddress: "BAET", MunicipalityFR: "Ans" });
    expect(JSON.stringify(e)).not.toMatch(/effectif|bilan/i); // la BCE n'a ni effectif ni chiffre financier
  });

  it("bce_entreprise : fiche d'une entreprise et d'une unité d'établissement, absence, faute de frappe", async () => {
    const fiche = await appeler(outils, "bce_entreprise", { numero: N.toitures.replace(/\./g, "") });
    expect(fiche).toMatchObject({ trouve: true, entreprise: { EnterpriseNumber: N.toitures } });
    const etab = await appeler(outils, "bce_entreprise", { numero: `BE ${E.toituresAns}` });
    expect(etab).toMatchObject({ trouve: true, etablissement: { EstablishmentNumber: E.toituresAns, EnterpriseNumber: N.toitures } });
    // Radiée par la mise à jour 134 : absente. Numéro au contrôle valide et absent : « absent du fichier actif ».
    const base8 = "01234567";
    const valide = formaterNumero(`${base8}${String(controleValide(base8)).padStart(2, "0")}`, "entreprise");
    expect(await appeler(outils, "bce_entreprise", { numero: valide })).toMatchObject({ trouve: false, motif: "absent_du_fichier_actif" });
    // Contrôle faux et absent : faute de frappe probable (les numéros du jeu d'essai sont tous « faux » : celui-ci est radié).
    expect(await appeler(outils, "bce_entreprise", { numero: N.courtier })).toMatchObject({ trouve: false, motif: "numero_invalide" });
    await expect(appeler(outils, "bce_entreprise", { numero: "12" })).rejects.toThrow(/Numéro BCE invalide/);
    await expect(appeler(outils, "bce_entreprise", { numero: "3123456789" })).rejects.toThrow(/commence par 0 ou 1/);
  });

  it("bce_changements : journal des mises à jour appliquées, filtres, radiation toujours listée, couverture honnête", async () => {
    const tous = await appeler(outils, "bce_changements", { depuis: "2026-10-01" });
    expect(tous["total"]).toBe(5);
    expect(tous["couverture"]).toMatchObject({ journal_depuis: "2026-10-14" });
    expect(tous["couverture"].note).toMatch(/aucun historique/);
    const types = (tous["changements"] as any[]).map((c) => c.type).sort();
    expect(types).toEqual(["changement_adresse", "changement_forme", "creation", "nouvel_etablissement", "radiation"]);
    const rad = (tous["changements"] as any[]).find((c) => c.type === "radiation");
    expect(rad).toEqual({ date: "2026-10-15", type: "radiation", EnterpriseNumber: N.courtier });
    const creation = (tous["changements"] as any[]).find((c) => c.type === "creation");
    expect(creation).toMatchObject({ EnterpriseNumber: N.nouvelle, commune: "Seraing", codePostal: "4100", nace: ["56.101"] });
    // Filtres : secteur 56 = création et changement de forme de restaurants, plus la radiation (toujours listée).
    const resto = await appeler(outils, "bce_changements", { depuis: "2026-10-01", nace: ["56"] });
    expect((resto["changements"] as any[]).map((c) => c.type).sort()).toEqual(["changement_forme", "creation", "radiation"]);
    const namur = await appeler(outils, "bce_changements", { depuis: "2026-10-01", communes: ["Namur"] });
    expect((namur["changements"] as any[]).map((c) => c.type).sort()).toEqual(["nouvel_etablissement", "radiation"]);
    expect((await appeler(outils, "bce_changements", { depuis: "2026-10-16" }))["total"]).toBe(0);
    await expect(appeler(outils, "bce_changements", { depuis: "demain" })).rejects.toThrow(/depuis invalide/);
  });

  it("recherche paginée : 10 résultats par page, ordre stable, total exact", async () => {
    const dossier = dossierTemporaire();
    const chemin = join(dossier, "gros.sqlite");
    const f = fichierComplet();
    const nums = Array.from({ length: 25 }, (_, i) => numeroFictif(`0${String(3000 + i).padStart(7, "0")}`));
    f["enterprise.csv"] = csv(["EnterpriseNumber", "Status", "JuridicalSituation", "TypeOfEnterprise", "JuridicalForm", "JuridicalFormCAC", "StartDate"], nums.map((n) => [n, "AC", "000", "2", "610", "", "01-01-2020"]));
    f["activity.csv"] = csv(["EntityNumber", "ActivityGroup", "NaceVersion", "NaceCode", "Classification"], nums.map((n) => [n, "003", "2008", "47190", "MAIN"]));
    f["establishment.csv"] = csv(["EstablishmentNumber", "StartDate", "EnterpriseNumber"], []);
    for (const t of ["denomination", "address", "contact"]) f[`${t}.csv`] = (f[`${t}.csv`] ?? "").split("\r\n")[0]! + "\r\n";
    await importerComplet(ecrireZip(dossier, "g.zip", f), chemin);
    const idx = new IndexBce(chemin);
    const o = outilsBce(() => idx);
    const p1 = await appeler(o, "bce_rechercher", { nace: ["47"] });
    const p2 = await appeler(o, "bce_rechercher", { nace: ["47"], page: 2 });
    const p3 = await appeler(o, "bce_rechercher", { nace: ["47"], page: 3 });
    expect([p1["total"], p1["pages"], p1["taille_page"]]).toEqual([25, 3, 10]);
    expect([p1["entreprises"].length, p2["entreprises"].length, p3["entreprises"].length]).toEqual([10, 10, 5]);
    expect([...p1["entreprises"], ...p2["entreprises"], ...p3["entreprises"]].map((e: any) => e.EnterpriseNumber)).toEqual([...nums].sort());
    expect((await appeler(o, "bce_rechercher", { nace: ["47"], page: 4 }))["entreprises"]).toEqual([]);
    idx.fermer();
  });

  it("index absent ou vide : erreur claire, jamais une réponse vide trompeuse", async () => {
    const vide = new IndexBce(join(dossierTemporaire(), "absent.sqlite"));
    for (const [nom, args] of [["bce_rechercher", {}], ["bce_entreprise", { numero: N.toitures }], ["bce_changements", { depuis: "2026-01-01" }]] as const) {
      await expect(appeler(outilsBce(() => vide), nom, args)).rejects.toThrow(/Index BCE indisponible/);
    }
  });
});
