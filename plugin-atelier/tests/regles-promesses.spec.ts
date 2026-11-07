import { describe, expect, it } from "vitest";
import { controlerPromesses } from "../src/serveur/regles-promesses.js";
import { evaluerPorte, type EntreesPorte } from "../src/serveur/porte.js";

const codes = (texte: string) => controlerPromesses(texte).map((c) => c.libelle);

describe("promesses interdites (lot 2 #22, T9)", () => {
  it("refuse la phrase de l'issue : quatre formules relevées", () => {
    expect(codes("Rendement garanti à vie, votre pension sera doublée sans aucun risque.").sort()).toEqual(
      ["garanti à vie", "pension doublée", "rendement garanti", "sans aucun risque"].sort(),
    );
  });

  for (const phrase of [
    "RENDEMENT GARANTI dès la première année.",
    "Des rendements garantis pour toute la famille.",
    "Placement sans aucun risque.",
    "Nous sommes le meilleur courtier de Liège.",
    "Une rente garantie a vie.",
    "Votre pension doublee en dix ans.",
    "Ｒｅｎｄｅｍｅｎｔ garanti",
  ]) {
    it(`refuse « ${phrase} » (casse, accents, pleine chasse)`, () => {
      expect(controlerPromesses(phrase)).toHaveLength(1);
    });
  }

  for (const phrase of [
    "Aucun rendement n'est garanti.",
    "Le rendement n'est pas garanti et dépend des marchés.",
    "Aucun placement, même prudent, n'offre un rendement garanti.",
    "Ce placement n'est jamais sans aucun risque.",
    "Ce n'est pas sans aucun risque.",
    // Négation juste avant la formule (« jamais »), pas les guillemets : ils ne protègent plus rien (M3).
    "N'écrivez jamais \"le meilleur courtier\" dans une annonce.",
    "Un rendement prudent, sans frais d'entrée.",
    // Mention prudente courante : « non » nie la formule.
    "Capital et rendement non garantis.",
  ]) {
    it(`laisse passer « ${phrase} » (négation qui porte sur la formule, ou formule absente)`, () => {
      expect(controlerPromesses(phrase)).toEqual([]);
    });
  }

  // M3 (revue de sécurité du lot 2) : négation voisine qui ne porte pas sur la formule, guillemets, citation
  // en retrait, code, caractères invisibles, homoglyphes et formule coupée par un retour à la ligne.
  for (const [phrase, libelle, ligne] of [
    ["Ne laissez pas passer ce rendement garanti.", "rendement garanti", 1],
    ["Pas de frais et un rendement garanti", "rendement garanti", 1],
    ["Ni frais cachés ni surprise et rendement garanti", "rendement garanti", 1],
    ["Notre offre : « rendement garanti »", "rendement garanti", 1],
    ["> Rendement garanti pour tous", "rendement garanti", 1],
    ["`rendement garanti`", "rendement garanti", 1],
    ["```\nrendement garanti\n```", "rendement garanti", 2],
    ["Un rende\u00ADment garanti.", "rendement garanti", 1],
    ["Un rendement gar\u0430nti.", "rendement garanti", 1],
    ["Un rendement\u200B garanti.", "rendement garanti", 1],
    ["Un rende\u200Cment\u2060 gara\uFEFFnti.", "rendement garanti", 1],
    ["Un rendement\ngaranti pour tous.", "rendement garanti", 1],
    ["# Offre\n\nVotre épargne profite d'un\nrendement\ngaranti.", "rendement garanti", 4],
    ["Pas de paperasse, investissez sans aucun risque", "sans aucun risque", 1],
  ] as const) {
    it(`relève « ${phrase.replace(/\n/gu, "⏎")} » (${libelle}, ligne ${ligne})`, () => {
      expect(controlerPromesses(phrase)).toEqual([{ code: "promesse_interdite", libelle, ligne, extrait: libelle }]);
    });
  }

  it("relève les formules entre guillemets d'une consigne : elles seraient publiées telles quelles", () => {
    expect(codes("Évitez les slogans comme « rendement garanti » ou « sans aucun risque ».").sort()).toEqual(["rendement garanti", "sans aucun risque"]);
  });

  it("une liste ne prolonge pas le paragraphe : la négation de l'élément précédent ne couvre pas le suivant", () => {
    expect(controlerPromesses("- Aucun frais\n- Rendement garanti")).toEqual([
      { code: "promesse_interdite", libelle: "rendement garanti", ligne: 2, extrait: "rendement garanti" },
    ]);
  });

  it("reste linéaire sur un long livrable sans ponctuation (pas de retour arrière catastrophique)", () => {
    const debut = Date.now();
    expect(controlerPromesses("aucun rendement garanti ".repeat(40_000))).toEqual([]);
    expect(Date.now() - debut).toBeLessThan(2_000);
  });

  it("localise la promesse (ligne et extrait)", () => {
    expect(controlerPromesses("# Offre\n\nUn rendement garanti.")).toEqual([
      { code: "promesse_interdite", libelle: "rendement garanti", ligne: 3, extrait: "rendement garanti" },
    ]);
  });
});

describe("porte : promesse interdite", () => {
  function entrees(livrable: string): EntreesPorte {
    return {
      porte: { exigencesCiblees: [], revuesRequises: [], maxCycles: 3 },
      exigences: [],
      livrable: { revisionId: "r1" },
      couvertures: [],
      verdicts: [],
      constats: [],
      revisionsDejaRefusees: [],
      faits: { livrable, fiche: { identifiants: [], noms: [] } },
    };
  }

  it("REFUS promesse_interdite sur la phrase de l'issue", () => {
    const r = evaluerPorte(entrees("Rendement garanti à vie, votre pension sera doublée sans aucun risque."));
    expect(r.decision).toBe("REFUS");
    expect(new Set(r.motifs.map((m) => m.code))).toEqual(new Set(["promesse_interdite"]));
    expect(r.motifs[0]!.emplacement).toBe("ligne 1");
  });

  it("PASS quand la négation est explicite", () => {
    expect(evaluerPorte(entrees("Aucun rendement n'est garanti.")).decision).toBe("PASS");
  });
});
