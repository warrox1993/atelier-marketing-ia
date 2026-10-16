/**
 * Non-régression de la revue de sécurité du 15/10/2026 sur les règles des connaissances :
 * expressions régulières à temps linéaire (G1), pseudonymisation des valeurs qui fuyaient (M1),
 * porte des chiffres d'offre (M2), refus des données de santé (m4). Données entièrement fictives.
 */
import { describe, expect, it } from "vitest";
import { adresseConnaissance } from "../src/contrats/connaissances.js";
import { RAPPORT_CROISSANCE_MAX, rapportCroissance } from "./outils-temps.js";
import { nettoyerTexte } from "../src/connaissances/extraction/normalisation.js";
import {
  controlerCitationsConnaissances,
  pseudonymiser,
  refusDonneesSante,
  type VersionPourValidite,
} from "../src/serveur/regles-connaissances.js";

const CLE = "cle-de-test-fictive-32-octets!!!";
const pseudo = (t: string) => pseudonymiser(t, { cle: CLE });
/** Rapport de croissance du temps de `f` quand l'entrée `motif(n)` grandit (voir outils-temps.ts). */
const croissance = (motif: (n: number) => string, f: (t: string) => unknown, petit: number) => rapportCroissance(motif, f, petit);

/* ------------------------------------------------------------------ */
describe("G1 : motifs de pseudonymisation à temps linéaire", () => {
  it("« police » suivi de milliers d'espaces : croissance linéaire (près de 5 s pour 2 000 avant, cubique)", () => {
    expect(croissance((n) => `police${" ".repeat(n)}x`, pseudo, 5_000)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    expect(croissance((n) => `police${"\t ".repeat(n)}: x`, pseudo, 2_500)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
  });

  it("espaces exotiques répétés (U+1680, U+2028, U+2029) ramenés à une espace par le nettoyage", () => {
    for (const c of [" ", " ", " ", "  "]) {
      const t = nettoyerTexte(`police${c.repeat(5_000)}x`);
      expect(t).toBe("police x");
      expect(croissance((n) => nettoyerTexte(`police${c.repeat(n)}x`), pseudo, 1_250)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    }
    // Même sans nettoyage préalable : la pseudonymisation réduit elle-même les espaces.
    expect(croissance((n) => `police${"\u2028".repeat(n)}x`, pseudo, 5_000)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
  });

  // Les sauts de ligne ne sont pas réduits par la pseudonymisation : seul le motif borné (espaces et
  // tabulations, jamais « \s ») protège ici. 2 000 sauts de ligne coûtaient plusieurs secondes.
  it("« police » suivi de milliers de sauts de ligne : croissance linéaire (9 s pour 2 000 avant, cubique)", () => {
    expect(croissance((n) => `police${"\n".repeat(n)}x`, pseudo, 500)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    expect(croissance((n) => `police d'assurance${" \n".repeat(n)}: x`, pseudo, 250)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
  });

  it("longue suite de caractères de courriel sans arobase : croissance linéaire (quadratique avant)", () => {
    expect(croissance((n) => "a".repeat(n), pseudo, 20_000)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    expect(croissance((n) => "a.".repeat(n), pseudo, 10_000)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
  });

  it("le numéro de police reste masqué avec le motif borné", () => {
    const r = pseudo("Votre police n° AB-123456 et la polis nr. 9876543.");
    expect(r.texte).not.toContain("123456");
    expect(r.texte).not.toContain("9876543");
    expect(r.rapport.numerosPolice).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
describe("M1 : valeurs personnelles qui fuyaient, désormais masquées", () => {
  const fuites: Array<[string, string, keyof ReturnType<typeof pseudo>["rapport"]]> = [
    ["IBAN be71 0961 2345 6769", "0961", "iban"],
    ["IBAN BE71-0961-2345-6769", "0961", "iban"],
    ["IBAN BE71  0961 2345 6769", "0961", "iban"],
    ["IBAN BE71.0961.2345.6769", "0961", "iban"],
    ["GSM0470123456", "0470", "telephones"],
    ["tél 0470 - 12 34 56", "0470", "telephones"],
    ["tél ０４７０１２３４５６", "４７０", "telephones"],
    ["tél +33 6 12 34 56 78", "56 78", "telephones"],
    ["tel +31 6 12345678", "12345678", "telephones"],
    ["NISS 85 07 30 033 28", "033", "registreNational"],
    ["NISS 850730-033-28", "033", "registreNational"],
    ["jean.dupont＠exemple.example", "dupont", "courriels"],
    ["jean.dupont​@exemple.example", "dupont", "courriels"],
    ["élodie.müller@exemple.example", "müller", "courriels"],
  ];
  for (const [entree, fragment, categorie] of fuites) {
    it(`masque « ${entree} »`, () => {
      const r = pseudo(entree);
      expect(r.texte).not.toContain(fragment);
      expect(r.texte).toMatch(/\[client-[0-9a-f]{8}\]/u);
      expect(r.rapport[categorie]).toBe(1);
    });
  }

  it("la même valeur écrite autrement donne la même marque", () => {
    const a = pseudo("IBAN BE71 0961 2345 6769").texte;
    const b = pseudo("IBAN be71-0961-2345-6769").texte;
    expect(a).toBe(b);
    expect(pseudo("0470123456").texte).toBe(pseudo("GSM0470 12 34 56").texte.replace("GSM", ""));
  });

  it("un numéro d'entreprise « BE0… » n'est pas pris pour un téléphone", () => {
    const r = pseudo("Numéro d'entreprise BE0412345678.");
    expect(r.rapport.telephones).toBe(0);
  });

  it("limite documentée : noms, adresses et dates de naissance restent en clair", () => {
    const t = "Monsieur Jean Dupont, né le 12/03/1985, rue de la Loi 16, 1000 Bruxelles";
    expect(pseudo(t).texte).toBe(t);
  });
});

/* ------------------------------------------------------------------ */
const DOC = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A1 = adresseConnaissance(DOC, 1, P1);
const V1: VersionPourValidite = { documentId: DOC, version: 1, statut: "en_vigueur", valideDu: "2026-01-01", valideAu: null };
const porte = (livrable: string, options?: { urlsSourcesTache?: Iterable<string> }, rendues: string[] = []) =>
  controlerCitationsConnaissances(livrable, rendues, [V1], "2026-10-15", options).map((c) => c.code);

describe("M2 : porte des chiffres d'offre", () => {
  it("une URL quelconque ne couvre plus un chiffre d'offre", () => {
    expect(porte("La prime est de 150 € par an (https://x.invalid).")).toEqual(["chiffre_offre_sans_source"]);
  });

  it("une URL enregistrée comme source de la tâche couvre le chiffre de son bloc", () => {
    const urls = ["https://tarifs.example/auto"];
    expect(porte("La prime est de 150 € par an (https://tarifs.example/auto).", { urlsSourcesTache: urls })).toEqual([]);
    expect(porte("La prime est de 150 € par an (https://autre.example/).", { urlsSourcesTache: urls })).toEqual(["chiffre_offre_sans_source"]);
  });

  it("une URL dans un titre ne couvre plus toute la section", () => {
    const urls = ["https://tarifs.example/auto"];
    expect(porte("## Tarifs (https://tarifs.example/auto)\n\nPrime : 150 € par an.", { urlsSourcesTache: urls })).toEqual(["chiffre_offre_sans_source"]);
  });

  it("une adresse connaissance:// non rendue à la tâche ne couvre pas le chiffre", () => {
    const codes = porte(`La prime est de 150 € (${A1}).`);
    expect(codes).toContain("chiffre_offre_sans_source");
    expect(codes).toContain("citation_connaissance_inconnue");
    expect(porte(`La prime est de 150 € (${A1}).`, undefined, [A1])).toEqual([]);
  });

  for (const phrase of ["La prime est de EUR 150 par an.", "La prime est de EUR150 par an.", "La prime est de cent cinquante euros par an.", "La prime est de １５０ € par an.", "Remise de dix pour cent."]) {
    it(`repère « ${phrase} »`, () => {
      expect(porte(phrase)).toEqual(["chiffre_offre_sans_source"]);
    });
  }

  // Revue du 16/10 : notations belges « 150,- € », multiplicateurs « 150 k€ », « 1,5 M€ » et « 150EUR » collé.
  for (const phrase of ["Prime de 150,- € par an.", "Prime de 150.- EUR par an.", "Budget de 150 k€.", "Budget de 1,5 M€.", "Budget de 150K EUR.", "Prime de 150EUR par an.", "Prime de 150,- euros."]) {
    it(`repère « ${phrase} »`, () => {
      expect(porte(phrase)).toEqual(["chiffre_offre_sans_source"]);
    });
  }

  it("pas de faux positif sur des mots proches de « euro »", () => {
    expect(porte("Couverture en Europe pour 3 véhicules.")).toEqual([]);
    expect(porte("Le contrat 2026 couvre 4 membres de la famille.")).toEqual([]);
  });

  it("motifs bornés : chiffres et espaces répétés contrôlés en temps linéaire (7,8 s pour 40 000 chiffres avant)", () => {
    expect(croissance((n) => "1".repeat(n), porte, 12_500)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    expect(croissance((n) => "1 ".repeat(n), porte, 12_500)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
    expect(croissance((n) => `franchise ${"1 ".repeat(n)}`, porte, 12_500)).toBeLessThan(RAPPORT_CROISSANCE_MAX);
  });

  it("au-delà de la taille contrôlée : constat explicite, sans analyse", () => {
    const c = controlerCitationsConnaissances(`Texte. ${"a".repeat(600_000)}`, [], [], "2026-10-15");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ code: "chiffre_offre_sans_source", decision: "refus", adresse: null });
    expect(c[0]!.message).toMatch(/trop volumineux/u);
  });
});

/* ------------------------------------------------------------------ */
describe("m4 : refus des données de santé, ponctuation et abréviations", () => {
  for (const titre of ["Questionnaire  de santé", "Questionnaire-de-santé", "Rapport méd. du client", "Certificat méd. 2026", "questionnaire_medical"]) {
    it(`refuse « ${titre} »`, () => {
      expect(refusDonneesSante({ type: "note_rdv", titre }).refus).toBe(true);
    });
  }

  it("une fiche « assurance soins de santé » reste importable", () => {
    expect(refusDonneesSante({ type: "fiche_produit", titre: "Assurance soins de santé" }).refus).toBe(false);
    expect(refusDonneesSante({ type: "fiche_produit", titre: "Médaille du mérite" }).refus).toBe(false);
  });
});
