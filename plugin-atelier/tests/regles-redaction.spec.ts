/**
 * Règles de rédaction de la porte (LANG-L3, audit du 29/10/2026) : tiret cadratin et guillemets droits hors code
 * et hors citation, d'après la consigne commune « Langue et style ».
 */
import { describe, expect, it } from "vitest";
import { evaluerPorte, type EntreesPorte } from "../src/serveur/porte.js";
import { controlerRedaction } from "../src/serveur/regles-redaction.js";

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

describe("règles de rédaction", () => {
  it("relève le tiret cadratin et les guillemets droits de la prose, une fois par règle avec le nombre", () => {
    const ecarts = controlerRedaction("# Titre\n\nUn devis \u2014 gratuit.\nDit \"vite\" et encore \u2014 ici.");
    expect(ecarts.map((e) => [e.code, e.occurrences, e.ligne])).toEqual([
      ["redaction_tiret_cadratin", 2, 3],
      ["redaction_guillemets_droits", 2, 4],
    ]);
    expect(ecarts[0]?.extrait).toBe("Un devis \u2014 gratuit.");
  });

  it("ignore le code, les citations, les blocs cités, les liens et les balises", () => {
    const texte = [
      "Commande `curl -H \"Accept: x\"` et lien https://exemple.test/?q=\"a\".",
      "```json",
      "{\"titre\": \"A \u2014 B\"}",
      "```",
      "> Citation de la source \u2014 telle quelle, \"mot\".",
      "Le rapport dit « deux bureaux \u2014 un seul \"site\" ».",
      "<a href=\"https://exemple.test\">page</a>",
    ].join("\n");
    expect(controlerRedaction(texte)).toEqual([]);
  });

  it("refuse le livrable à la porte et laisse passer un texte propre", () => {
    const refus = evaluerPorte(entrees("Notre offre \u2014 sans engagement."));
    expect(refus.decision).toBe("REFUS");
    expect(refus.motifs.map((m) => m.code)).toEqual(["redaction_tiret_cadratin"]);
    expect(refus.motifs[0]?.emplacement).toBe("ligne 1");
    expect(evaluerPorte(entrees("Notre offre, sans engagement : « devis gratuit ».")).decision).toBe("PASS");
  });
});
