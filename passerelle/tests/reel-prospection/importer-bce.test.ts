// Lot P3 : importation de la BCE dans l'index SQLite local, sur des fichiers de test AU FORMAT OFFICIEL (entreprises fictives).
// Prouve : le filtre « personnes physiques jamais chargées », la liste blanche des tables enfants, la mise à jour
// incrémentale (création, changement de forme et d'adresse, nouvel établissement, radiation), l'idempotence, le refus d'un
// trou de numérotation et la conservation du journal.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { enregistrementsCsv, lireCsv } from "../../src/reel/prospection/csv.js";
import { appliquerMiseAJour, dateIsoDeBce, detecterTypeArchive, importerComplet, normaliserNumeroBce } from "../../src/reel/prospection/bce/importer.js";
import { IndexBce } from "../../src/reel/prospection/bce/index.js";
import { controleModulo97Valide } from "../../src/commun/prospection/numeros.js";
import {
  COURRIEL_PERSONNE_PHYSIQUE, E, N, NOM_ETABLISSEMENT_PHYSIQUE, NOM_PERSONNE_PHYSIQUE, RUE_PERSONNE_PHYSIQUE,
  creerZip, csv, dossierTemporaire, ecrireZip, etatIndex, fichierComplet, miseAJour134, miseAJour135,
} from "./aide-bce.js";

const lire = async (texte: string | Buffer[]): Promise<string[][]> => {
  const sortie: string[][] = [];
  for await (const l of enregistrementsCsv(Readable.from(typeof texte === "string" ? [Buffer.from(texte)] : texte))) sortie.push(l);
  return sortie;
};

describe("CSV (format des fichiers de la BCE)", () => {
  it("champs entre guillemets, guillemet doublé, virgule et retour à la ligne dans un champ, CRLF, BOM", async () => {
    const texte = '﻿"A","B","C"\r\n"x","dit ""oui"", puis non","ligne 1\nligne 2"\r\n"","",""\r\n';
    expect(await lire(texte)).toEqual([["A", "B", "C"], ["x", 'dit "oui", puis non', "ligne 1\nligne 2"], ["", "", ""]]);
  });

  it("champs sans guillemets, dernière ligne sans fin de ligne, lignes vides ignorées", async () => {
    expect(await lire("a,b\n1,2\n\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("résiste à un découpage en morceaux au milieu d'un caractère UTF-8 et d'un guillemet doublé", async () => {
    const octets = Buffer.from('"é","a""b"\n"ü","c"\n', "utf8");
    const morceaux = Array.from(octets, (_, i) => octets.subarray(i, i + 1));
    expect(await lire(morceaux)).toEqual([["é", 'a"b'], ["ü", "c"]]);
  });

  it("lireCsv : objets par nom de colonne, colonne manquante = chaîne vide, guillemet jamais fermé = erreur", async () => {
    const { entete, lignes } = await lireCsv(Readable.from([Buffer.from('"A","B"\n"1"\n')]));
    expect(entete).toEqual(["A", "B"]);
    const toutes: Record<string, string>[] = [];
    for await (const l of lignes) toutes.push(l);
    expect(toutes).toEqual([{ A: "1", B: "" }]);
    await expect(lire('"A"\n"ouvert')).rejects.toThrow(/guillemet ouvert/);
  });
});

describe("valeurs", () => {
  it("numéros BCE : formes acceptées et refus", () => {
    expect(normaliserNumeroBce("0123456789")).toBe("0123.456.789");
    expect(normaliserNumeroBce("BE 0123.456.789")).toBe("0123.456.789");
    expect(normaliserNumeroBce("1123456789")).toBe("1123.456.789");
    expect(normaliserNumeroBce("2.123.456.789")).toBe("2.123.456.789");
    expect(normaliserNumeroBce("3123456789")).toBeNull();
    expect(normaliserNumeroBce("12345")).toBeNull();
  });
  it("dates JJ-MM-AAAA → ISO ; dates impossibles refusées", () => {
    expect(dateIsoDeBce("31-12-2026")).toBe("2026-12-31");
    expect(dateIsoDeBce("31-02-2026")).toBeNull();
    expect(dateIsoDeBce("2026-12-31")).toBeNull();
  });
  it("tous les numéros du jeu d'essai ont un contrôle modulo 97 FAUX (aucune vraie entreprise possible)", () => {
    for (const n of [...Object.values(N), ...Object.values(E)]) expect(controleModulo97Valide(n.replace(/\./g, "")), n).toBe(false);
  });
});

describe("importation complète", () => {
  let dossier: string;
  let index: string;
  beforeEach(() => {
    dossier = dossierTemporaire();
    index = join(dossier, "bce.sqlite");
  });

  it("charge les personnes morales, rapport chiffré, méta de l'extraction", async () => {
    const zip = ecrireZip(dossier, "KboOpenData_0133_2026_10_Full.zip", fichierComplet());
    expect(await detecterTypeArchive(zip)).toBe("complet");
    const rapport = await importerComplet(zip, index);
    expect(rapport).toMatchObject({ type: "complet", statut: "applique", extraction: { numero: 133, date: "2026-10-14" } });
    expect(rapport.fichiers["enterprise"]).toMatchObject({ lues: 6, retenues: 5, personnes_physiques: 1 });
    const db = new Database(index, { readonly: true });
    expect((db.prepare("SELECT COUNT(*) n FROM enterprise").get() as { n: number }).n).toBe(5);
    expect((db.prepare("SELECT Value FROM meta WHERE Variable = 'SnapshotDate'").get() as { Value: string }).Value).toBe("2026-10-14");
    db.close();
  });

  it("AUCUNE personne physique dans l'index : ni entité, ni établissement, ni dénomination, adresse, contact, activité", async () => {
    const rapport = await importerComplet(ecrireZip(dossier, "complet.zip", fichierComplet()), index);
    const db = new Database(index, { readonly: true });
    const types = db.prepare("SELECT DISTINCT TypeOfEnterprise t FROM enterprise").all() as { t: string }[];
    expect(types).toEqual([{ t: "2" }]);
    for (const table of ["enterprise", "establishment", "denomination", "address", "contact", "activity"]) {
      const colonne = table === "enterprise" ? "EnterpriseNumber" : table === "establishment" ? "EstablishmentNumber" : "EntityNumber";
      for (const interdit of [N.personnePhysique, E.secretPhysique]) {
        expect((db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${colonne} = ?`).get(interdit) as { n: number }).n, `${table} ${interdit}`).toBe(0);
      }
    }
    expect((db.prepare("SELECT COUNT(*) n FROM establishment WHERE EnterpriseNumber = ?").get(N.personnePhysique) as { n: number }).n).toBe(0);
    db.close();
    // Les données personnelles de test n'apparaissent nulle part dans le fichier SQLite lui-même (octets bruts).
    const octets = readFileSync(index).toString("latin1");
    for (const secret of [NOM_PERSONNE_PHYSIQUE, NOM_ETABLISSEMENT_PHYSIQUE, RUE_PERSONNE_PHYSIQUE, COURRIEL_PERSONNE_PHYSIQUE]) expect(octets.includes(secret), secret).toBe(false);
    // Rapport : les lignes des tables enfants de la personne physique sont comptées « hors périmètre ».
    expect(rapport.fichiers["denomination"]!.hors_perimetre).toBe(3); // personne physique, son établissement, orpheline
    expect(rapport.fichiers["address"]!.hors_perimetre).toBe(3);
    expect(rapport.fichiers["establishment"]!.hors_perimetre).toBe(1);
  });

  it("zone dérivée du code postal ; pays étranger reconnu ; dates ISO", async () => {
    await importerComplet(ecrireZip(dossier, "complet.zip", fichierComplet()), index);
    const db = new Database(index, { readonly: true });
    const a = db.prepare("SELECT MunicipalityNorm, ProvinceNorm, Region, CountryIso FROM address WHERE EntityNumber = ? AND TypeOfAddress = 'REGO'");
    expect(a.get(N.toitures)).toEqual({ MunicipalityNorm: "liege", ProvinceNorm: "liege", Region: "Wallonie", CountryIso: "BE" });
    expect(a.get(N.etrangere)).toEqual({ MunicipalityNorm: "paris", ProvinceNorm: "", Region: "", CountryIso: "FR" });
    expect((db.prepare("SELECT StartDateIso d FROM enterprise WHERE EnterpriseNumber = ?").get(N.toitures) as { d: string }).d).toBe("2019-03-15");
    db.close();
  });

  it("refuse un fichier incomplet ou une colonne obligatoire manquante, en les nommant, et ne touche pas l'index existant", async () => {
    await importerComplet(ecrireZip(dossier, "ok.zip", fichierComplet()), index);
    const avant = etatIndex(index);
    const sansContact = fichierComplet();
    delete (sansContact as Record<string, string | undefined>)["contact.csv"];
    await expect(importerComplet(ecrireZip(dossier, "a.zip", sansContact), index)).rejects.toThrow(/contact\.csv/);
    const sansColonne = { ...fichierComplet(), "enterprise.csv": csv(["EnterpriseNumber", "Status"], [[N.toitures, "AC"]]) };
    await expect(importerComplet(ecrireZip(dossier, "b.zip", sansColonne), index)).rejects.toThrow(/TypeOfEnterprise/);
    await expect(importerComplet(ecrireZip(dossier, "c.zip", miseAJour134()), index)).rejects.toThrow(/pas un fichier complet|absent/);
    expect(etatIndex(index)).toBe(avant);
  });

  it("archive illisible : erreur claire", async () => {
    const chemin = join(dossier, "faux.zip");
    (await import("node:fs")).writeFileSync(chemin, "ceci n'est pas un zip");
    await expect(importerComplet(chemin, index)).rejects.toThrow(/ZIP illisible/);
  });

  it("une ligne de date ou de numéro invalide est comptée et ignorée, sans arrêter l'import", async () => {
    const f = fichierComplet();
    f["enterprise.csv"] = csv(["EnterpriseNumber", "Status", "JuridicalSituation", "TypeOfEnterprise", "JuridicalForm", "JuridicalFormCAC", "StartDate"], [
      [N.toitures, "AC", "000", "2", "610", "", "15-03-2019"],
      ["pas-un-numero", "AC", "000", "2", "610", "", "15-03-2019"],
      [N.brasserie, "AC", "000", "2", "014", "", "31-02-2024"],
    ]);
    const r = await importerComplet(ecrireZip(dossier, "x.zip", f), index);
    expect(r.fichiers["enterprise"]).toMatchObject({ lues: 3, retenues: 1, invalides: 2 });
  });
});

describe("mise à jour incrémentale", () => {
  let dossier: string;
  let index: string;
  let zip133: string;
  let zip134: string;
  beforeEach(async () => {
    dossier = dossierTemporaire();
    index = join(dossier, "bce.sqlite");
    zip133 = ecrireZip(dossier, "KboOpenData_0133_2026_10_Full.zip", fichierComplet());
    zip134 = ecrireZip(dossier, "KboOpenData_0134_2026_10_Update.zip", miseAJour134());
    await importerComplet(zip133, index);
  });

  const evenements = (): { Date: string; Type: string; EnterpriseNumber: string; Detail: Record<string, unknown> }[] => {
    const db = new Database(index, { readonly: true });
    const l = (db.prepare("SELECT Date, Type, EnterpriseNumber, Detail FROM changement ORDER BY Id").all() as { Date: string; Type: string; EnterpriseNumber: string; Detail: string }[]).map((e) => ({ ...e, Detail: JSON.parse(e.Detail) as Record<string, unknown> }));
    db.close();
    return l;
  };

  it("applique créations, changements de forme et d'adresse, nouvel établissement et radiation, et les journalise", async () => {
    expect(await detecterTypeArchive(zip134)).toBe("mise_a_jour");
    const r = await appliquerMiseAJour(zip134, index);
    expect(r).toMatchObject({ type: "mise_a_jour", statut: "applique", extraction: { numero: 134, date: "2026-10-15" }, evenements: 5, purgees: 1 });
    const db = new Database(index, { readonly: true });
    const un = <T>(sql: string, ...p: unknown[]): T => db.prepare(sql).get(...p) as T;
    expect(un<{ f: string }>("SELECT JuridicalForm f FROM enterprise WHERE EnterpriseNumber = ?", N.brasserie).f).toBe("610");
    expect(un<{ z: string }>("SELECT Zipcode z FROM address WHERE EntityNumber = ? AND TypeOfAddress = 'REGO'", N.toitures).z).toBe("4100");
    expect(un("SELECT 1 FROM enterprise WHERE EnterpriseNumber = ?", N.courtier)).toBeUndefined();
    // La radiation emporte les données de l'entreprise (dénomination, adresse, activités).
    for (const t of ["denomination", "address", "activity"]) expect(un<{ n: number }>(`SELECT COUNT(*) n FROM ${t} WHERE EntityNumber = ?`, N.courtier).n).toBe(0);
    expect(un<{ n: number }>("SELECT COUNT(*) n FROM enterprise WHERE EnterpriseNumber = ?", N.nouvelle).n).toBe(1);
    expect(un<{ n: number }>("SELECT COUNT(*) n FROM establishment WHERE EstablishmentNumber = ?", E.namurNouveau).n).toBe(1);
    db.close();

    const e = evenements();
    expect(e.map((x) => `${x.Date} ${x.Type} ${x.EnterpriseNumber}`).sort()).toEqual([
      `2026-10-15 changement_adresse ${N.toitures}`,
      `2026-10-15 changement_forme ${N.brasserie}`,
      `2026-10-15 creation ${N.nouvelle}`,
      `2026-10-15 nouvel_etablissement ${N.couvreurNamur}`,
      `2026-10-15 radiation ${N.courtier}`,
    ].sort());
    expect(e.find((x) => x.Type === "changement_forme")!.Detail).toEqual({ de: "014", vers: "610" });
    expect(e.find((x) => x.Type === "changement_adresse")!.Detail).toEqual({ de: "4000 Liège", vers: "4100 Seraing" });
    expect(e.find((x) => x.Type === "creation")!.Detail).toEqual({ denomination: "Nouvelle Entreprise Fictive SRL", commune: "Seraing", codePostal: "4100" });
    expect(e.find((x) => x.Type === "nouvel_etablissement")!.Detail).toMatchObject({ etablissement: E.namurNouveau, commune: "Namur", codePostal: "5000" });
  });

  it("une personne physique créée par la mise à jour n'entre jamais dans l'index (ni ses dénominations ni ses adresses)", async () => {
    await appliquerMiseAJour(zip134, index);
    const octets = readFileSync(index).toString("latin1");
    expect(octets.includes("Personne Physique Fictive Beta")).toBe(false);
    expect(octets.includes("Rue Secrete Beta")).toBe(false);
    const db = new Database(index, { readonly: true });
    expect((db.prepare("SELECT COUNT(*) n FROM enterprise WHERE EnterpriseNumber = ?").get(N.nouvellePersonnePhysique) as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM address WHERE EntityNumber = ?").get(N.nouvellePersonnePhysique) as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM enterprise WHERE TypeOfEnterprise <> '2'").get() as { n: number }).n).toBe(0);
    db.close();
    expect(evenements().some((x) => x.EnterpriseNumber === N.nouvellePersonnePhysique)).toBe(false);
  });

  it("une entreprise qui devient personne physique est PURGÉE de l'index, sans événement de radiation", async () => {
    await appliquerMiseAJour(zip134, index);
    const r = await appliquerMiseAJour(ecrireZip(dossier, "KboOpenData_0135_2026_10_Update.zip", miseAJour135()), index);
    expect(r.purgees).toBe(1);
    const db = new Database(index, { readonly: true });
    for (const [table, col] of [["enterprise", "EnterpriseNumber"], ["establishment", "EnterpriseNumber"], ["denomination", "EntityNumber"], ["address", "EntityNumber"], ["activity", "EntityNumber"]] as const) {
      expect((db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(N.couvreurNamur) as { n: number }).n, table).toBe(0);
    }
    expect((db.prepare("SELECT COUNT(*) n FROM address WHERE EntityNumber = ?").get(E.namurNouveau) as { n: number }).n).toBe(0);
    db.close();
    expect(readFileSync(index).toString("latin1").includes("Couvertures Namuroises Fictives")).toBe(false);
    expect(evenements().filter((x) => x.EnterpriseNumber === N.couvreurNamur && x.Type === "radiation")).toHaveLength(0);
  });

  it("rejouer la même mise à jour : état identique (ignorée, puis réappliquée de force)", async () => {
    await appliquerMiseAJour(zip134, index);
    const apres = etatIndex(index);
    const deuxieme = await appliquerMiseAJour(zip134, index);
    expect(deuxieme.statut).toBe("deja_appliquee");
    expect(etatIndex(index)).toBe(apres);
    const forcee = await appliquerMiseAJour(zip134, index, { forcer: true });
    expect(forcee).toMatchObject({ statut: "applique", evenements: 0 });
    expect(etatIndex(index)).toBe(apres);
  });

  it("refuse un trou dans la numérotation des extractions, sauf demande explicite ; l'index reste intact", async () => {
    const trou = ecrireZip(dossier, "trou.zip", { ...miseAJour135(), "meta.csv": csv(["Variable", "Value"], [["SnapshotDate", "17-10-2026"], ["ExtractType", "update"], ["ExtractNumber", "136"]]) });
    const avant = etatIndex(index);
    await expect(appliquerMiseAJour(trou, index)).rejects.toThrow(/Trou dans les mises à jour.*133.*136/);
    expect(etatIndex(index)).toBe(avant);
    await expect(appliquerMiseAJour(trou, index, { autoriserTrou: true })).resolves.toMatchObject({ statut: "applique" });
  });

  it("refuse une mise à jour sur un index absent, ou un fichier complet à la place d'une mise à jour", async () => {
    await expect(appliquerMiseAJour(zip134, join(dossier, "absent.sqlite"))).rejects.toThrow(/Aucun index/);
    await expect(appliquerMiseAJour(zip133, index)).rejects.toThrow(/fichier complet/);
  });

  it("une mise à jour dont une suppression est mal formée est refusée en bloc (transaction annulée)", async () => {
    const mauvaise = { ...miseAJour134(), "address_delete.csv": csv(["Inconnue"], [["x"]]) };
    const avant = etatIndex(index);
    await expect(appliquerMiseAJour(ecrireZip(dossier, "m.zip", mauvaise), index)).rejects.toThrow(/aucune colonne reconnue/);
    expect(etatIndex(index)).toBe(avant);
  });

  it("conservation : une durée courte purge les événements anciens, la durée par défaut les garde", async () => {
    await appliquerMiseAJour(zip134, index);
    expect(evenements()).toHaveLength(5);
    const zip135 = ecrireZip(dossier, "KboOpenData_0135_2026_10_Update.zip", miseAJour135());
    // Conservation de 0 jour : la limite est la date de l'extraction (16/10), les événements du 15/10 disparaissent.
    await appliquerMiseAJour(zip135, index, { conservationJours: 0 });
    expect(evenements()).toHaveLength(0);
  });

  it("conservation : un nouveau fichier complet reprend le journal existant et sa date de départ", async () => {
    await appliquerMiseAJour(zip134, index);
    const avant = evenements();
    expect(avant).toHaveLength(5);
    await importerComplet(ecrireZip(dossier, "complet2.zip", fichierComplet({ type: "full", date: "20-10-2026", numero: 140 })), index);
    // Reprise filtrée : `nouvelle` n'est pas dans ce nouveau fichier complet, ses événements ne sont pas repris ; les radiations le sont.
    expect(evenements()).toEqual(avant.filter((e) => e.EnterpriseNumber !== N.nouvelle));
    const db = new Database(index, { readonly: true });
    const m = Object.fromEntries((db.prepare("SELECT Variable, Value FROM meta").all() as { Variable: string; Value: string }[]).map((x) => [x.Variable, x.Value]));
    db.close();
    expect(m).toMatchObject({ ExtractNumber: "140", SnapshotDate: "2026-10-20", JournalDepuis: "2026-10-14" });
  });

  it("un établissement rattaché à une entreprise personne physique (insertion seule, sans suppression) est purgé avec ses données", async () => {
    const ent = ["EntityNumber", "Language", "TypeOfDenomination", "Denomination"];
    const maj = {
      "meta.csv": csv(["Variable", "Value"], [["SnapshotDate", "15-10-2026"], ["ExtractType", "update"], ["ExtractNumber", "134"]]),
      "establishment_insert.csv": csv(["EstablishmentNumber", "StartDate", "EnterpriseNumber"], [[E.toituresAns, "01-02-2022", N.nouvellePersonnePhysique]]),
      "denomination_insert.csv": csv(ent, [[E.toituresAns, "1", "004", "Nom Commercial Personne Beta"]]),
    };
    await appliquerMiseAJour(ecrireZip(dossier, "m.zip", maj), index);
    const db = new Database(index, { readonly: true });
    for (const t of ["establishment", "denomination", "address", "activity"]) {
      const col = t === "establishment" ? "EstablishmentNumber" : "EntityNumber";
      expect((db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`).get(E.toituresAns) as { n: number }).n, t).toBe(0);
    }
    db.close();
    expect(readFileSync(index).toString("latin1").includes("Nom Commercial Personne Beta")).toBe(false);
  });

  it("le journal ne garde aucun événement d'une entreprise devenue personne physique, ni à la purge ni après un nouveau fichier complet", async () => {
    await appliquerMiseAJour(zip134, index);
    await appliquerMiseAJour(ecrireZip(dossier, "u135.zip", miseAJour135()), index);
    expect(evenements().filter((x) => x.EnterpriseNumber === N.couvreurNamur)).toHaveLength(0);
    // Nouveau fichier complet où `couvreurNamur` est une personne physique : ses événements ne sont pas repris.
    const f = fichierComplet({ type: "full", date: "20-10-2026", numero: 140 });
    f["enterprise.csv"] = f["enterprise.csv"]!.replace(new RegExp(`"${N.couvreurNamur}","AC","000","2"`), `"${N.couvreurNamur}","AC","000","1"`);
    await importerComplet(ecrireZip(dossier, "c3.zip", f), index);
    expect(evenements().filter((x) => x.EnterpriseNumber === N.couvreurNamur)).toHaveLength(0);
    expect(evenements().some((x) => x.Type === "radiation")).toBe(true);
  });

  it("une mise à jour plus ancienne que l'index est refusée, même forcée", async () => {
    await appliquerMiseAJour(zip134, index);
    const ancienne = ecrireZip(dossier, "vieille.zip", { ...miseAJour135(), "meta.csv": csv(["Variable", "Value"], [["SnapshotDate", "01-10-2026"], ["ExtractType", "update"], ["ExtractNumber", "134"]]) });
    await expect(appliquerMiseAJour(ancienne, index, { forcer: true })).rejects.toThrow(/plus ancienne que l'index/);
  });

  it("secteur : la version NACE 2003 n'entre pas dans la recherche ; les activités des établissements comptent", async () => {
    const maj = {
      "meta.csv": csv(["Variable", "Value"], [["SnapshotDate", "15-10-2026"], ["ExtractType", "update"], ["ExtractNumber", "134"]]),
      "activity_insert.csv": csv(["EntityNumber", "ActivityGroup", "NaceVersion", "NaceCode", "Classification"], [[N.brasserie, "003", "2003", "62010", "SECO"], [E.toituresAns, "003", "2008", "62010", "SECO"]]),
    };
    await appliquerMiseAJour(ecrireZip(dossier, "n.zip", maj), index);
    const idx = new IndexBce(index);
    expect(idx.rechercher({ nace: ["62"] }).elements.map((e) => e["EnterpriseNumber"])).toEqual([N.toitures]); // brasserie : 2003 ignorée ; toitures : via son établissement
    idx.fermer();
  });

  it("l'index lu à travers IndexBce suit le remplacement par un nouveau fichier complet (réouverture automatique)", async () => {
    const idx = new IndexBce(index);
    expect(idx.meta()["ExtractNumber"]).toBe("133");
    await importerComplet(ecrireZip(dossier, "c2.zip", fichierComplet({ type: "full", date: "20-10-2026", numero: 140 })), index);
    expect(idx.meta()["ExtractNumber"]).toBe("140");
    idx.fermer();
  });
});

describe("archives", () => {
  it("creerZip produit une archive que l'importateur sait relire (contrôle de l'aide de test)", async () => {
    const dossier = dossierTemporaire();
    const zip = ecrireZip(dossier, "z.zip", { "meta.csv": csv(["Variable", "Value"], [["SnapshotDate", "14-10-2026"]]) });
    expect(await detecterTypeArchive(zip)).toBe("complet");
    expect(creerZip({ "a.csv": "x" }).length).toBeGreaterThan(20);
  });
});
