// Service statbel : importation (jeu d'essai fictif au format Statbel) puis outils profil_commune et comparer_communes,
// appelés par le même chemin que la passerelle (validation Zod, enveloppe signée).

import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appelerOutil, construireCatalogue } from "../../src/outils.js";
import { FICHES_PAR_DEFAUT } from "../../src/services.js";
import { lireServicesLocaux, SERVICES_LOCAUX } from "../../src/config.js";
import { SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { IndexStatbel } from "../../src/reel/statbel/index.js";
import { fournisseurStatbelReel, FICHE_STATBEL } from "../../src/reel/statbel/outils.js";
import { construireIndexDeTest, type IndexDeTest } from "./aide-statbel.js";

type Obj = Record<string, any>;

describe("service statbel sur un jeu d'essai fictif", () => {
  let jeu: IndexDeTest;
  let index: IndexStatbel;
  const paire = generateKeyPairSync("ed25519");
  const signataire = new SignataireEnveloppe(paire.privateKey);
  const contexte = { service: "statbel", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "statistiques/statbel-local", libelle: "Statbel" } }, jetonPorteur: null };

  beforeAll(async () => {
    jeu = await construireIndexDeTest();
    index = new IndexStatbel(jeu.index);
  });
  afterAll(() => {
    index.fermer();
    rmSync(jeu.dossier, { recursive: true, force: true });
  });

  const catalogue = () => construireCatalogue(FICHE_STATBEL, "reel", fournisseurStatbelReel(() => index));
  const appeler = async (outil: string, args: unknown) => {
    const r = await appelerOutil(catalogue(), outil, args, contexte, signataire);
    return { erreur: r.isError === true, s: r.structuredContent as Obj };
  };
  const donnees = (s: Obj): Obj => (s["donnees"] ?? s) as Obj;

  it("catalogue : deux outils en lecture seule, service permis et fiche livrée par défaut", () => {
    const c = catalogue();
    expect([...c.outils.keys()].sort()).toEqual(["atelier_identite", "comparer_communes", "profil_commune"]);
    for (const nom of ["profil_commune", "comparer_communes"]) expect(c.outils.get(nom)!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(SERVICES_LOCAUX).toContain("statbel");
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "statbel" } as NodeJS.ProcessEnv)).toEqual(["statbel"]);
    expect(FICHES_PAR_DEFAUT.map((f) => f.id)).toContain("statbel");
  });

  it("importation : communes, années, valeurs masquées ignorées, codes INS fusionnés signalés", () => {
    const db = new Database(jeu.index, { readonly: true });
    const meta = Object.fromEntries((db.prepare("SELECT cle, valeur FROM meta").all() as { cle: string; valeur: string }[]).map((r) => [r.cle, r.valeur]));
    expect(meta).toMatchObject({ annee_population: "2026", annee_revenus: "2023", annee_tva: "2024", communes_revenus_non_rapprochees: "99999", communes_tva_non_rapprochees: "" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM revenus WHERE refnis = '90002'").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM tva WHERE refnis NOT GLOB '[0-9][0-9][0-9][0-9][0-9]'").get() as { n: number }).n).toBe(0);
    db.close();
  });

  it("profil_commune : chaque chiffre vaut ce que dit le jeu d'essai et porte année et source", async () => {
    const { erreur, s } = await appeler("profil_commune", { commune: "Exempleville" });
    expect(erreur).toBe(false);
    const p = donnees(s);
    expect(p["commune"]).toMatchObject({ code_ins: "90001", nom_fr: "Exempleville", nom_nl: "Voorbeeldstad", region: "Région wallonne" });
    expect(p["population"].total).toMatchObject({ valeur: 1600, annee: 2026, unite: "habitants" });
    expect(p["population"].hommes.valeur).toBe(800);
    expect(p["population"].femmes.valeur).toBe(800);
    expect(p["population"].etrangers.valeur).toBe(480); // 3 sur 10 : 3 x 80 âges x 2 sexes
    expect(p["population"].part_etrangers_pct.valeur).toBe(30);
    const tr = Object.fromEntries((p["tranches_age"] as Obj[]).map((t) => [t["tranche"], t["effectif"].valeur]));
    expect(tr).toEqual({ "0-14 ans": 300, "15-24 ans": 200, "25-39 ans": 300, "40-54 ans": 300, "55-64 ans": 200, "65-79 ans": 300, "80 ans et plus": 0 });
    expect(p["revenus"].declarations_fiscales).toMatchObject({ valeur: 800, annee: 2023 });
    expect(p["revenus"].revenu_moyen_par_declaration_eur).toMatchObject({ valeur: 30000, unite: "EUR", annee: 2023 });
    expect(p["revenus"].revenu_moyen_par_habitant_eur.valeur).toBe(15000);
    expect(p["entreprises_tva"].total_assujettis).toMatchObject({ valeur: 160, annee: 2024 });
    expect(p["entreprises_tva"].assujettis_pour_1000_habitants.valeur).toBe(100);
    expect((p["entreprises_tva"].principales_sections as Obj[]).map((x) => [x["section"], x["libelle"], x["assujettis"].valeur])).toEqual([
      ["F", "Construction", 100], ["G", "Commerce de gros et de détail", 50], ["A", "Agriculture, sylviculture et pêche", 10],
    ]);
    // Chaque chiffre du profil porte une année et une source.
    let nb = 0;
    const parcourir = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(parcourir);
      if (v === null || typeof v !== "object") return;
      const o = v as Obj;
      if ("valeur" in o) {
        nb++;
        expect(typeof o["annee"], JSON.stringify(o)).toBe("number");
        expect(String(o["source"]), JSON.stringify(o)).toContain("Statbel");
        expect(String(o["source"])).toContain(String(o["annee"]));
        return;
      }
      for (const [k, x] of Object.entries(o)) if (k !== "sources") parcourir(x);
    };
    parcourir(p);
    expect(nb).toBe(28); // 6 population + 14 tranches + 3 revenus + 2 TVA + 3 sections
    expect(p["sources"]).toHaveLength(4);
    expect(JSON.stringify(p["limites"])).toContain("médian");
  });

  it("la réponse est signée comme celles des autres services (lecture, sans écriture)", async () => {
    const r = await appelerOutil(catalogue(), "profil_commune", { commune: "Exempleville" }, contexte, signataire);
    const v = verifierEnveloppe(r.structuredContent as Record<string, unknown>, signataire.clePubliqueBase64);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.charge).toMatchObject({ service: "statbel", outil: "profil_commune", ecriture: false });
  });

  it("résolution : nom néerlandais sans accents ni casse, code postal, code INS, début de nom", async () => {
    for (const ref of ["voorbeeldstad", "EXEMPLEVILLE", "9000", "90001", "Exemplev"]) {
      const p = donnees((await appeler("profil_commune", { commune: ref })).s);
      expect(p["commune"]?.code_ins, ref).toBe("90001");
    }
  });

  it("référence ambiguë ou inconnue : jamais de commune devinée", async () => {
    const amb = donnees((await appeler("profil_commune", { commune: "9100" })).s);
    expect(amb).toMatchObject({ statut: "ambigue" });
    expect((amb["candidates"] as Obj[]).map((c) => c["code_ins"]).sort()).toEqual(["90003", "90004"]);
    const debut = donnees((await appeler("profil_commune", { commune: "Saint" })).s);
    expect(debut["statut"]).toBe("ambigue");
    for (const ref of ["Nulle part", "9998", "12345"]) expect(donnees((await appeler("profil_commune", { commune: ref })).s)["statut"], ref).toBe("introuvable");
  });

  it("chiffres absents : null avec une note, jamais 0 (valeurs masquées par Statbel)", async () => {
    const p = donnees((await appeler("profil_commune", { commune: "Essaimont" })).s);
    expect(p["revenus"].revenu_moyen_par_declaration_eur).toMatchObject({ valeur: null, annee: 2023 });
    expect(p["revenus"].revenu_moyen_par_declaration_eur.note).toContain("secret statistique");
    expect(p["entreprises_tva"].total_assujettis.valeur).toBeNull();
    expect(p["population"].total.valeur).toBe(240);
  });

  it("entrées hors bornes ou malveillantes : refusées par le schéma ou sans effet sur l'index", async () => {
    for (const args of [{}, { commune: "" }, { commune: "x".repeat(61) }, { commune: 42 }, { commune: "Liège", extra: 1 }]) {
      const r = await appeler("profil_commune", args);
      if (JSON.stringify(args).includes("extra")) { expect(r.erreur).toBe(false); continue; } // clé inconnue ignorée par Zod
      expect(r.erreur, JSON.stringify(args)).toBe(true);
      expect(donnees(r.s)["erreur"]).toBe("arguments_invalides");
    }
    for (const args of [{ communes: ["Exempleville"] }, { communes: Array.from({ length: 11 }, (_, k) => `c${k}`) }, { communes: ["a", ""] }, { communes: "Exempleville" }, {}]) {
      const r = await appeler("comparer_communes", args);
      expect(r.erreur, JSON.stringify(args)).toBe(true);
      expect(donnees(r.s)["erreur"]).toBe("arguments_invalides");
    }
    const piege = donnees((await appeler("profil_commune", { commune: "x'; DROP TABLE communes; --" })).s);
    expect(piege["statut"]).toBe("introuvable");
    const piege2 = donnees((await appeler("profil_commune", { commune: "%" })).s);
    expect(piege2["statut"]).toBe("introuvable"); // le joker LIKE est échappé : « % » ne couvre pas toutes les communes
    expect(donnees((await appeler("profil_commune", { commune: "Exempleville" })).s)["statut"]).toBe("trouvee");
  });

  it("comparer_communes : mêmes indicateurs côte à côte, doublons et références non résolues listés", async () => {
    const { erreur, s } = await appeler("comparer_communes", { communes: ["Exempleville", "9000", "Saint-Exemple", "9100", "Nulle part"] });
    expect(erreur).toBe(false);
    const c = donnees(s);
    const lignes = c["communes"] as Obj[];
    expect(lignes.map((l) => l["commune"].nom_fr)).toEqual(["Exempleville", "Saint-Exemple"]);
    expect(lignes[0]!["population"]).toMatchObject({ valeur: 1600, annee: 2026 });
    expect(lignes[0]!["part_moins_de_15_ans_pct"].valeur).toBe(18.8); // 300 / 1600
    expect(lignes[0]!["part_65_ans_et_plus_pct"].valeur).toBe(18.8);
    expect(lignes[0]!["revenu_moyen_par_habitant_eur"]).toMatchObject({ valeur: 15000, annee: 2023 });
    expect(lignes[1]!["revenu_moyen_par_declaration_eur"].valeur).toBe(25000);
    expect(lignes[1]!["part_65_ans_et_plus_pct"].valeur).toBe(16.7); // 40 personnes de 90 ans sur 240 habitants
    expect((c["non_resolues"] as Obj[]).map((n) => n["statut"])).toEqual(["doublon", "ambigue", "introuvable"]);
    for (const l of lignes) for (const [k, v] of Object.entries(l)) if (k !== "commune") expect(v, k).toMatchObject({ annee: expect.any(Number), source: expect.stringContaining("Statbel") });
  });

  it("E2-A : une référence non résolue n'est jamais renvoyée (pas d'écho de la saisie, numérique ou non)", async () => {
    for (const saisie of ["123456", "99999", "0000", "Zzyzx-777"]) {
      const { s } = await appeler("profil_commune", { commune: saisie });
      const c = donnees(s);
      expect(c["statut"]).toBe("introuvable");
      expect(c).not.toHaveProperty("reference");
      expect(JSON.stringify(c)).not.toContain(saisie);
    }
    const amb = donnees((await appeler("profil_commune", { commune: "9100" })).s);
    expect(amb["statut"]).toBe("ambigue");
    expect(amb).not.toHaveProperty("reference");
    expect(JSON.stringify(amb)).not.toContain("9100");
    expect((amb["candidates"] as Obj[]).length).toBeGreaterThan(1);
    const cmp = donnees((await appeler("comparer_communes", { communes: ["Exempleville", "123456", "Nulle part"] })).s);
    const non = cmp["non_resolues"] as Obj[];
    expect(non.map((n) => n["position"])).toEqual(["2e", "3e"]);
    expect(JSON.stringify(non)).not.toContain("123456");
    expect(JSON.stringify(non)).not.toContain("Nulle part");
    for (const n of non) expect(n).not.toHaveProperty("reference");
  });

  it("index absent : erreur d'outil claire, pas de réponse vide trompeuse", async () => {
    const absent = new IndexStatbel(`${jeu.dossier}/n-existe-pas.sqlite`);
    const r = await appelerOutil(construireCatalogue(FICHE_STATBEL, "reel", fournisseurStatbelReel(() => absent)), "profil_commune", { commune: "Liège" }, contexte, signataire);
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.structuredContent)).toContain("statbel-mise-a-jour.sh");
  });
});
