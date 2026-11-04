/**
 * DROIT-1.3 (audit du 29/10/2026) : la porte refuse un livrable qui recopie un numéro de téléphone belge en clair
 * (formats +32, 0032 et 04xx) ; les numéros de la fiche du client restent permis.
 */
import { describe, expect, it } from "vitest";
import { evaluerPorte, type EntreesPorte } from "../src/serveur/porte.js";
import { numerosTelephone, telephonesEnClair } from "../src/serveur/regles-telephone.js";

describe("DROIT-1.3 : numéros de téléphone belges", () => {
  it.each([
    ["+32 470 12 34 56", "0470123456"],
    ["+32 (0)4 222 33 44", "042223344"],
    ["0032 4 222 33 44", "042223344"],
    ["0032470123456", "0470123456"],
    ["0470/12.34.56", "0470123456"],
    ["0470 12 34 56", "0470123456"],
    ["04 222 33 44", "042223344"],
    ["02-512.34.56", "025123456"],
    // Revue de sécurité finale M3 : séparateur entouré d'espaces, forme d'un BCE invalide, chiffres pleine chasse.
    ["04 / 223 45 67", "042234567"],
    ["0470 / 12 34 56", "0470123456"],
    ["0470.123.456", "0470123456"],
    ["＋３２ ４７０ １２ ３４ ５６", "0470123456"],
  ])("« %s » est reconnu (%s)", (texte, attendu) => {
    expect(numerosTelephone(`Cabinet : ${texte}.`)).toEqual([attendu]);
  });

  // Revue de sécurité 2 (M-1) : indicatif entre parenthèses, tirets typographiques, espace sans chasse, signes accolés.
  it.each([
    ["(04) 223 45 67", "042234567"],
    ["(042) 23 45 67", "042234567"],
    ["04–223–45–67", "042234567"],
    ["04‐223‐45‐67", "042234567"],
    ["04−223−45−67", "042234567"],
    ["04​223​45​67", "042234567"],
    ["04 -/ 223 45 67", "042234567"],
    ["+32 (0)4 223 45 67", "042234567"],
  ])("SR2-M-1 : « %s » est reconnu (%s)", (texte, attendu) => {
    expect(numerosTelephone(`Cabinet : ${texte}.`)).toEqual([attendu]);
  });

  it("SR2-M-1 : le découpage par ligne reste juste après retrait des invisibles", () => {
    expect(telephonesEnClair("# Contact\nAppelez au (04) 223 45 67\nfin", [])).toEqual([{ ligne: 2 }]);
    expect(numerosTelephone("Réf. 04​\n223 45 67")).toEqual([]);
  });

  it.each(["BCE 0123.456.749", "le 01/02/2026", "IBAN BE68 5390 0754 7034", "Code postal 4000, 12 praticiens", "GSM écarté", "1234567890"])("« %s » n'est pas un numéro", (texte) => {
    expect(numerosTelephone(texte)).toEqual([]);
  });

  it("un BCE à la forme 04xx.xxx.xxx n'est écarté que si son contrôle modulo 97 le confirme", () => {
    // 0403.199.702 : BCE valide (4031997 mod 97 = 95, 97 - 95 = 2).
    expect(numerosTelephone("BCE 0403.199.702")).toEqual([]);
    expect(numerosTelephone("BCE 0403.199.703")).toEqual(["0403199703"]);
  });

  it("un numéro ne se forme pas à cheval sur deux lignes", () => {
    expect(numerosTelephone("Réf. 04\n223 45 67")).toEqual([]);
  });

  it("un numéro de la fiche du client est permis, un autre est relevé par sa ligne seulement", () => {
    expect(telephonesEnClair("# Contact\nAppelez-nous au 04 222 33 44\nDr X : 0470 12 34 56", ["042223344"])).toEqual([{ ligne: 3 }]);
  });

  it("la porte refuse le livrable et le motif ne recopie pas le numéro", () => {
    const e: EntreesPorte = {
      porte: { exigencesCiblees: ["REQ-001"], revuesRequises: [{ role: "metier", agentId: "m" }], maxCycles: 3 },
      exigences: [{ code: "REQ-001", obligatoire: true, elementsAttendus: [], exclusionEtat: "aucune", version: 1 }],
      livrable: { revisionId: "r1" },
      couvertures: [{ id: "c", revisionId: "r1", code: "REQ-001", etat: "couvert", preuves: [{ revisionId: "r1", emplacement: "Liste", element: null, extrait: "Liste" }], question: null, creeLe: "1" }],
      verdicts: [{ id: "v", revisionId: "r1", role: "metier", relecteurId: "m", verdict: "PASS", exigencesExaminees: [], preuvesVerifiees: [], justification: null, creeLe: "2" }],
      constats: [],
      revisionsDejaRefusees: [],
      faits: { livrable: "# Liste\n\n| Cabinet | Numéro |\n| A | +32 470 12 34 56 |", fiche: { identifiants: [], noms: [] }, telephonesFiche: [] },
    };
    const r = evaluerPorte(e);
    expect(r.decision).toBe("REFUS");
    const m = r.motifs.find((x) => x.code === "numero_telephone_en_clair");
    expect(m).toMatchObject({ emplacement: "ligne 4" });
    expect(JSON.stringify(r.motifs)).not.toMatch(/470/u);
    expect(evaluerPorte({ ...e, faits: { ...e.faits!, telephonesFiche: ["0470123456"] } }).decision).toBe("PASS");
  });
});
