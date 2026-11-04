import { describe, expect, it } from "vitest";
import { validerAffirmation, validerPreuve } from "../src/serveur/observatoire/affirmations.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

const affirmation = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID1,
  projetId: ID2,
  chapitre: "fiche.version",
  texte: "La dernière version stable est la 6.8.0.",
  statut: "rapporte_editeur",
  confiance: { niveau: 2, motif: "Publiée sur le dépôt officiel" },
  versionConcernee: "6.8.0",
  remplaceePar: null,
  preuves: [],
  ...surcharge,
});

const preuve = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
  instantaneId: ID3,
  essaiId: null,
  extraitExact: EXTRAIT,
  position: POSITION,
  ...surcharge,
});

const instantane = { texteNormalise: "La dernière version stable est la 6.8.0." };
const EXTRAIT = "version stable est la 6.8.0";
const POSITION = instantane.texteNormalise.indexOf(EXTRAIT);

describe("affirmations et preuves (K6)", () => {
  it("refuse un statut hors des 8", () => {
    expect(() => validerAffirmation(affirmation({ statut: "certain" }))).toThrow(ErreurAtelier);
  });

  it("refuse un motif de confiance vide", () => {
    expect(() => validerAffirmation(affirmation({ confiance: { niveau: 1, motif: "   " } }))).toThrow(ErreurAtelier);
  });

  it("refuse une preuve sans instantané ni essai", () => {
    expect(() => validerPreuve(preuve({ instantaneId: null }), null)).toThrow(ErreurAtelier);
  });

  it("refuse un extrait absent de l'instantané", () => {
    expect(() => validerPreuve(preuve({ extraitExact: "7.0.0" }), instantane)).toThrow(/extrait/u);
  });

  it("refuse un extrait d'un seul caractère présent dans l'instantané", () => {
    expect(() => validerPreuve(preuve({ extraitExact: "6", position: instantane.texteNormalise.indexOf("6") }), instantane)).toThrow(/extrait/u);
  });

  it("refuse un extrait présent mais à une autre position que celle déclarée", () => {
    expect(() => validerPreuve(preuve({ position: 0 }), instantane)).toThrow(/extrait/u);
  });

  it("accepte la version 6.8.0 avec son extrait", () => {
    const p = validerPreuve(preuve(), instantane);
    expect(p.extraitExact).toBe(EXTRAIT);
    const a = validerAffirmation(affirmation({ preuves: [p] }));
    expect(a.versionConcernee).toBe("6.8.0");
  });

  // Changement de comportement voulu : le service d'essais K8 n'existe pas, un essai ne prouve rien.
  // shortcut: preuves par essai refusées, à rouvrir avec K8
  it("refuse une preuve vers un essai (K8 non branché), avec un motif lisible", () => {
    expect(() => validerPreuve(preuve({ instantaneId: null, essaiId: ID3, extraitExact: "sortie de l'essai" }), null)).toThrow(/essai/u);
    expect(() => validerPreuve(preuve({ instantaneId: null, essaiId: ID3, extraitExact: "sortie de l'essai" }), null)).toThrow(ErreurAtelier);
  });

  it("refuse une preuve vers un instantané sans son texte", () => {
    expect(() => validerPreuve(preuve(), null)).toThrow(ErreurAtelier);
  });
});
