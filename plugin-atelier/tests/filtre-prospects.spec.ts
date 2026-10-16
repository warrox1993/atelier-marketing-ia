import { describe, expect, it } from "vitest";
import { ActionDiscussion } from "../src/serveur/discussion-actions.js";
import { filtreDepuisAdresse, FiltreProspects, parametresDepuisFiltre } from "../src/contrats/filtre-prospects.js";

describe("filtre des prospects dans l'adresse", () => {
  it("le schéma de l'action accepte un filtre valide et refuse champ inconnu, valeur hors forme ou ancien format texte", () => {
    const ok = (filtre: unknown) => ActionDiscussion.safeParse({ type: "ouvrir", cible: "prospects", filtre }).success;
    expect(ok({ statut: "qualifie", segment: "medecins", campagne: "00000000-0000-4000-8000-000000000001", zone: "Liège, 4000", source: "reelle", score: "60", qualifies: "oui" })).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ statut: "inconnu" })).toBe(false);
    expect(ok({ companyId: "x" })).toBe(false);
    expect(ok({ segment: "<script>" })).toBe(false);
    expect(ok({ zone: "a".repeat(81) })).toBe(false);
    expect(ok("qualifies")).toBe(false);
  });

  it("aller-retour objet, paramètres d'adresse, objet", () => {
    const f = { statut: "refuse", segment: "kines", campagne: "c_1", zone: "Liège", secteur: "86.210, 8622", source: "demonstration", score: "0", qualifies: "oui" } as const;
    expect(FiltreProspects.parse(f)).toEqual(f);
    expect(filtreDepuisAdresse(`?${parametresDepuisFiltre(f)}`)).toEqual(f);
  });

  it("une adresse géante ou illisible donne un filtre vide", () => {
    expect(filtreDepuisAdresse(`?statut=qualifie&${"x=1&".repeat(600)}`)).toEqual({});
    expect(parametresDepuisFiltre(null).toString()).toBe("");
    expect(parametresDepuisFiltre("qualifies").toString()).toBe("");
  });
});
