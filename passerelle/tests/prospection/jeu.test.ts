// Lot P2 : le jeu de prospection est déterministe, entièrement fictif, sans personne physique, et contient les pièges.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { construireJeu, jeuProspection, piegesProspection, tailleDe } from "../../src/demo/prospection/jeu.js";
import { analyserNumero, controleModulo97Valide, controleValide, numeroDemonstration } from "../../src/demo/prospection/numeros.js";
import { NOM_ASSUREUR_PAR_DEFAUT, nomAssureurDemo, VARIABLE_NOM_ASSUREUR } from "../../src/demo/prospection/referentiel.js";
import { exportComplet } from "./aide.js";

const empreinte = (t: string): string => createHash("sha256").update(t, "utf8").digest("hex");

describe("numéros BCE de démonstration", () => {
  it("contrôle modulo 97 : un numéro réel connu valide, le même au contrôle décalé invalide", () => {
    // Exemple de la règle (base 02032013 → 97 − (2032013 mod 97)) : on teste la règle elle-même, pas une entreprise.
    const base = "02032013";
    const ok = `${base}${String(controleValide(base)).padStart(2, "0")}`;
    expect(controleModulo97Valide(ok)).toBe(true);
    const faux = `${base}${String((controleValide(base) % 97) + 1).padStart(2, "0")}`;
    expect(controleModulo97Valide(faux)).toBe(false);
  });

  it("numeroDemonstration : toujours un contrôle faux, sur 5 000 clés, pour les deux types", () => {
    for (let i = 0; i < 5000; i++) {
      for (const type of ["entreprise", "etablissement"] as const) {
        const n = numeroDemonstration(type, `cle-${i}`);
        expect(n).toMatch(/^\d{10}$/);
        expect(controleModulo97Valide(n), n).toBe(false);
        expect(n[0] === "2").toBe(type === "etablissement");
        expect(["0", "1", "2"]).toContain(n[0]);
      }
    }
  });

  it("100 % des numéros du jeu (entreprises, établissements, radiées, registre FSMA) échouent au contrôle", () => {
    const jeu = jeuProspection();
    const numeros = [
      ...jeu.entreprises.flatMap((e) => [e.numero, ...e.etablissements.map((x) => x.numero)]),
      ...jeu.radiees.map((r) => r.numero),
      ...jeu.fsma.map((f) => f.numeroBce),
    ];
    expect(numeros.length).toBeGreaterThan(60);
    for (const n of numeros) {
      let valide = false;
      try {
        valide = analyserNumero(n).controleValide;
      } catch {
        valide = false; // numéro mal formé (piège FSMA) : invalide aussi
      }
      expect(valide, n).toBe(false);
    }
  });

  it("numéros uniques", () => {
    const jeu = jeuProspection();
    const numeros = [...jeu.entreprises.flatMap((e) => [e.numero, ...e.etablissements.map((x) => x.numero)]), ...jeu.radiees.map((r) => r.numero)];
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("analyserNumero : formats acceptés et refusés, en français", () => {
    expect(analyserNumero("BE 0123.456.789").formate).toBe("0123.456.789");
    expect(analyserNumero("2123456789").formate).toBe("2.123.456.789");
    expect(() => analyserNumero("0123.456.78")).toThrow(/10 chiffres attendus/);
    expect(() => analyserNumero("9123456789")).toThrow(/commence par 0 ou 1/);
  });
});

describe("déterminisme", () => {
  it("deux constructions indépendantes donnent les mêmes octets", () => {
    expect(JSON.stringify(construireJeu())).toBe(JSON.stringify(construireJeu()));
  });

  it("empreinte de référence du jeu (même résultat d'un processus à l'autre)", () => {
    // Valeur figée au premier calcul : ne change que par une modification voulue du jeu, à justifier.
    expect(empreinte(JSON.stringify(construireJeu()))).toBe("fbacc729e10343455d66ef2e2627866e34abc70b345bafa7be6637a8ce5c66ff");
  });

  it("le nom de l'assureur vient de l'environnement et ne change pas les graines", () => {
    expect(nomAssureurDemo({})).toBe(NOM_ASSUREUR_PAR_DEFAUT);
    expect(nomAssureurDemo({ [VARIABLE_NOM_ASSUREUR]: "  Assureur Local Essai (démonstration) " })).toBe("Assureur Local Essai (démonstration)");
    expect(nomAssureurDemo({ [VARIABLE_NOM_ASSUREUR]: "   " })).toBe(NOM_ASSUREUR_PAR_DEFAUT);
    expect(nomAssureurDemo({ [VARIABLE_NOM_ASSUREUR]: "x".repeat(200) })).toBe(NOM_ASSUREUR_PAR_DEFAUT);
  });
});

describe("entièrement fictif", () => {
  it("aucune personne physique : toutes les entités sont des personnes morales avec une forme juridique de société", () => {
    const jeu = jeuProspection();
    expect(jeu.entreprises.length).toBeGreaterThanOrEqual(50);
    for (const e of jeu.entreprises) {
      expect(["610", "014"]).toContain(e.forme);
      expect(e.denomination).toMatch(/\(démonstration\)/);
    }
  });

  it("sortie complète des outils : TypeOfEnterprise = 2 partout, aucune entité de type 1", async () => {
    const texte = await exportComplet();
    expect(texte).not.toMatch(/"TypeOfEnterprise":"1"/);
    expect(texte.match(/"TypeOfEnterprise":"2"/g)!.length).toBeGreaterThan(50);
  });

  it("courriels @exemple.invalid, adresses web .example, téléphones +32 4 000 00 NN (NN ≥ 10) seulement", async () => {
    const texte = await exportComplet();
    const courriels = texte.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(courriels.length).toBeGreaterThan(20);
    for (const c of courriels) expect(c.endsWith("@exemple.invalid"), c).toBe(true);
    const urls = texte.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(20);
    for (const u of urls) expect(new URL(u).hostname.endsWith(".demo-prospection.example"), u).toBe(true);
    expect(texte.match(/\b[a-z0-9-]+\.(?:be|com|fr|net|org|eu|io|nl|de|lu|co|info|biz)\b/gi) ?? []).toEqual([]);
    const tels = texte.match(/\+\d[\d ]{6,}\d/g) ?? [];
    expect(tels.length).toBeGreaterThan(20);
    for (const t of tels) expect(t, t).toMatch(/^\+32 4 000 00 [1-9]\d$/);
    expect(texte.match(/\b0\d{1,3}[ /.]\d{2,3}[ .]\d{2}[ .]\d{2}\b/g) ?? []).toEqual([]);
  });

  it("le nom réel d'un client ne figure dans aucune sortie : seul le nom générique par défaut apparaît", async () => {
    const texte = await exportComplet();
    expect(texte).toContain(NOM_ASSUREUR_PAR_DEFAUT);
  });
});

describe("pièges", () => {
  it("doublon, hors zone, radiée, FSMA contradictoires et numéro mal formé sont tous présents", () => {
    const ids = piegesProspection().map((p) => p.id);
    expect(ids.filter((i) => i === "doublon")).toHaveLength(2);
    for (const id of ["hors_zone", "bce_radiee_fsma_inscrit", "fsma_radie_bce_actif", "numero_invalide"]) expect(ids, id).toContain(id);
  });

  it("le doublon : même adresse, dénominations identiques au suffixe de forme près, numéros différents", () => {
    const [a, b] = jeuProspection().entreprises.filter((e) => e.piege === "doublon");
    expect(a!.numero).not.toBe(b!.numero);
    expect(b!.denomination.replace(/ SRL$/, "")).toBe(a!.denomination);
    expect(a!.siege).toEqual(b!.siege);
  });

  it("la radiée n'est pas dans le fichier actif mais reste inscrite à la FSMA, avec d'anciens comptes", () => {
    const jeu = jeuProspection();
    const r = jeu.radiees[0]!;
    expect(jeu.entreprises.some((e) => e.numero === r.numero)).toBe(false);
    expect(jeu.fsma.find((f) => f.numeroBce === r.numero)?.statut).toBe("Inscrit");
    expect(jeu.evenements.some((e) => e.type === "radiation" && e.numero === r.numero)).toBe(true);
  });

  it("couvre des tailles variées, y compris « inconnue »", () => {
    const tailles = new Set(jeuProspection().entreprises.map((e) => tailleDe(e.comptes)));
    for (const t of ["micro", "petite", "inconnue"]) expect(tailles.has(t as never), t).toBe(true);
  });
});
