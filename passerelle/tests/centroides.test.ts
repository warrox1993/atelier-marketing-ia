// Position approximative (item 15) : centroïdes OSM par code postal puis par commune, et champ `position_approx`
// des outils bce_rechercher / bce_entreprise (réel et démonstration).

import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OutilPasserelle } from "../src/fournisseurs.js";
import { outilRechercher } from "../src/demo/prospection/bce.js";
import { appliquerMiseAJour, importerComplet } from "../src/reel/prospection/bce/importer.js";
import { IndexBce } from "../src/reel/prospection/bce/index.js";
import { outilsBce } from "../src/reel/prospection/bce/outils.js";
import { CentroidesOsm } from "../src/reel/prospection/osm/centroides.js";
import { creerTablesOsm } from "../src/reel/prospection/osm/importer.js";
import { appeler as appelerDemo } from "./prospection/aide.js";
import { appeler, dossierTemporaire, E, ecrireZip, fichierComplet, miseAJour134, N } from "./reel-prospection/aide-bce.js";

function creerOsmDeTest(chemin: string): void {
  const db = new Database(chemin);
  creerTablesOsm(db);
  db.prepare("INSERT INTO meta VALUES ('ExtractDate', '2026-10-01')").run();
  const ins = db.prepare("INSERT INTO poi (Id, Nom, NomNorm, Categorie, Cle, Valeur, CodePostal, Commune, CommuneNorm, Lat, Lon) VALUES (?, ?, ?, 'commerce', 'shop', 'bakery', ?, ?, ?, ?, ?)");
  ins.run("node/1", "A", "a", "4000", "Liège", "liege", 50.0, 5.0);
  ins.run("node/2", "B", "b", "4000", "Liège", "liege", 50.2, 5.2);
  ins.run("node/3", "C", "c", null, "Ans", "ans", 50.66, 5.52); // sans code postal : seule la commune est connue
  ins.run("node/4", "D", "d", "4100", "Seraing", "seraing", 50.58, 5.5);
  db.close();
}

describe("CentroidesOsm", () => {
  let chemin: string;
  beforeAll(() => {
    chemin = join(dossierTemporaire(), "osm.sqlite");
    creerOsmDeTest(chemin);
  });

  it("moyenne des positions par code postal", () => {
    const p = new CentroidesOsm(chemin).position("4000", "Liège");
    expect(p).toEqual({ lat: 50.1, lon: 5.1, precision: "code_postal", source: "osm" });
  });

  it("à défaut de code postal connu : commune normalisée (minuscules, sans accent)", () => {
    const c = new CentroidesOsm(chemin);
    expect(c.position("4430", "ANS")).toEqual({ lat: 50.66, lon: 5.52, precision: "commune", source: "osm" });
    expect(c.position(null, "LIÈGE")?.precision).toBe("commune");
  });

  it("inconnu : null", () => {
    const c = new CentroidesOsm(chemin);
    expect(c.position("9999", "Nulle-Part")).toBeNull();
    expect(c.position(undefined, undefined)).toBeNull();
  });

  it("index absent : null partout, sans erreur", () => {
    const c = new CentroidesOsm(join(dossierTemporaire(), "absent.sqlite"));
    expect(c.position("4000", "Liège")).toBeNull();
  });

  it("fichier illisible (pas une base SQLite) : null, sans erreur", async () => {
    const { writeFileSync } = await import("node:fs");
    const faux = join(dossierTemporaire(), "faux.sqlite");
    writeFileSync(faux, "ceci n'est pas une base");
    expect(new CentroidesOsm(faux).position("4000", "Liège")).toBeNull();
  });
});

describe("position_approx dans les outils bce réels", () => {
  let index: IndexBce;
  let avec: OutilPasserelle[];
  let sans: OutilPasserelle[];

  beforeAll(async () => {
    const dossier = dossierTemporaire();
    const chemin = join(dossier, "bce.sqlite");
    await importerComplet(ecrireZip(dossier, "KboOpenData_0133_2026_10_Full.zip", fichierComplet()), chemin);
    await appliquerMiseAJour(ecrireZip(dossier, "KboOpenData_0134_2026_10_Update.zip", miseAJour134()), chemin);
    const osm = join(dossier, "osm.sqlite");
    creerOsmDeTest(osm);
    index = new IndexBce(chemin);
    const centroides = new CentroidesOsm(osm);
    avec = outilsBce(() => index, () => centroides);
    sans = outilsBce(() => index);
  });
  afterAll(() => index.fermer());

  it("bce_entreprise : le siège et chaque établissement portent leur position", async () => {
    const r = (await appeler(avec, "bce_entreprise", { numero: N.toitures }))["entreprise"];
    // Siège à Seraing 4100 (code postal connu), établissement à Ans 4430 (commune seulement).
    expect(r.position_approx).toEqual({ lat: 50.58, lon: 5.5, precision: "code_postal", source: "osm" });
    expect(r.etablissements[0].position_approx).toEqual({ lat: 50.66, lon: 5.52, precision: "commune", source: "osm" });
    // Les champs existants sont conservés.
    expect(r.EnterpriseNumber).toBe(N.toitures);
    expect(r.adresses.length).toBeGreaterThan(0);
  });

  it("bce_entreprise : une unité d'établissement seule porte aussi sa position", async () => {
    const s = (await appeler(avec, "bce_entreprise", { numero: E.toituresAns }))["etablissement"];
    expect(s.position_approx).toMatchObject({ precision: "commune", source: "osm" });
  });

  it("bce_rechercher : chaque entreprise de la page porte position_approx", async () => {
    const r = await appeler(avec, "bce_rechercher", { nace: ["43.91"] });
    expect(r["entreprises"].length).toBeGreaterThan(0);
    for (const e of r["entreprises"]) expect("position_approx" in e).toBe(true);
    expect(r["entreprises"].some((e: any) => e.position_approx !== null)).toBe(true);
  });

  it("sans index OSM : position_approx vaut null mais le champ est présent", async () => {
    const r = (await appeler(sans, "bce_entreprise", { numero: N.toitures }))["entreprise"];
    expect(r.position_approx).toBeNull();
    expect(r.etablissements[0].position_approx).toBeNull();
  });

  it("les descriptions annoncent une position approximative, pas l'adresse exacte", () => {
    for (const nom of ["bce_rechercher", "bce_entreprise"]) {
      expect(avec.find((o) => o.nom === nom)!.description).toContain("jamais l'adresse exacte");
    }
  });
});

describe("position_approx dans le simulateur", () => {
  it("déterministe : deux appels donnent les mêmes positions", async () => {
    const a = await appelerDemo(outilRechercher, {});
    const b = await appelerDemo(outilRechercher, {});
    expect((a["entreprises"] as any[]).map((e) => e.position_approx)).toEqual((b["entreprises"] as any[]).map((e) => e.position_approx));
  });

  it("bce_rechercher démo : chaque entreprise a position_approx {lat, lon, precision, source}", async () => {
    const r = await appelerDemo(outilRechercher, {});
    for (const e of r["entreprises"] as any[]) {
      expect(e.position_approx).toMatchObject({ precision: "code_postal", source: "osm" });
      expect(e.position_approx.lat).toBeGreaterThan(49);
      expect(e.position_approx.lat).toBeLessThan(52);
      for (const s of e.etablissements) expect(s.position_approx).not.toBeUndefined();
    }
  });
});
