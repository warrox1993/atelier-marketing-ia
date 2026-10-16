// @vitest-environment jsdom
/**
 * Fiche de la marque : saisie facultative de la position (latitude, longitude) de chaque établissement,
 * validation, envoi `position: { lat, lon }` ou `null`, affichage de la position enregistrée.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { lirePosition, segmentsDejaUtilises } from "../../src/ui/vues/marque.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont("/RNO/atelier/marque");
  pont.actions["atelier.marque.enregistrer"] = async () => ({});
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
});

async function ouvrirEditeur() {
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  const c = rendu.conteneur;
  await cliquer(parTexte(c, "button", "Nouvelle version"));
  return c;
}

const envoyes = () => pont.appelsActions.filter((a) => a.cle === "atelier.marque.enregistrer");
const etablissements = () => (envoyes()[0]?.params as { etablissements: Array<Record<string, unknown>> }).etablissements;

describe("lirePosition", () => {
  it("accepte le point ou la virgule et refuse les valeurs hors bornes ou à moitié saisies", () => {
    expect(lirePosition("50,6123", "5.5612")).toEqual({ position: { lat: 50.6123, lon: 5.5612 }, erreur: null });
    expect(lirePosition("", " ")).toEqual({ position: null, erreur: null });
    expect(lirePosition("50", "").erreur).toContain("les deux");
    expect(lirePosition("91", "5").erreur).toContain("entre -90 et 90");
    expect(lirePosition("50", "-181").erreur).toContain("entre -180 et 180");
    expect(lirePosition("abc", "5").erreur).toContain("nombres");
  });
});

describe("marque : position des établissements", () => {
  it("envoie la position saisie, vide devient null", async () => {
    const c = await ouvrirEditeur();
    expect(c.textContent).toContain("Clic droit sur le lieu dans OpenStreetMap ou Google Maps");
    await saisir(champParLibelle(c, "Latitude de l'établissement 1"), "50,6123");
    await saisir(champParLibelle(c, "Longitude de l'établissement 1"), "5,5612");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(envoyes()).toHaveLength(1);
    const e = etablissements();
    expect(e[0]?.position).toEqual({ lat: 50.6123, lon: 5.5612 });
    expect(e[1]?.position).toBeNull();
    expect(e[0]).not.toHaveProperty("lat");
  });

  it("refuse une latitude hors bornes avec un message clair et n'envoie rien", async () => {
    const c = await ouvrirEditeur();
    await saisir(champParLibelle(c, "Latitude de l'établissement 1"), "123");
    await saisir(champParLibelle(c, "Longitude de l'établissement 1"), "5");
    expect(c.textContent).toContain("La latitude doit être comprise entre -90 et 90.");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(envoyes()).toHaveLength(0);
  });

  it("refuse une seule coordonnée", async () => {
    const c = await ouvrirEditeur();
    await saisir(champParLibelle(c, "Latitude de l'établissement 2"), "50,6");
    expect(c.textContent).toContain("Indiquez la latitude et la longitude, ou laissez les deux vides.");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(envoyes()).toHaveLength(0);
  });

  it("affiche la position existante dans la fiche et la reprend dans l'éditeur", async () => {
    const donnees = EXEMPLES_DONNEES["atelier.marque"] as unknown as { marque: { etablissements: Array<Record<string, unknown>> } };
    const etabs = donnees.marque.etablissements.map((x, i) => (i === 0 ? { ...x, position: { lat: 50.6123, lon: 5.5612 } } : x));
    pont.donnees["atelier.marque"] = { data: { ...donnees, marque: { ...donnees.marque, etablissements: etabs } }, loading: false, error: null };
    const c = await ouvrirEditeur();
    expect(c.textContent).toContain("Position : 50,6123 ; 5,5612");
    expect((champParLibelle(c, "Latitude de l'établissement 1") as HTMLInputElement).value).toBe("50,6123");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(etablissements()[0]?.position).toEqual({ lat: 50.6123, lon: 5.5612 });
  });
});

describe("marque : saisie allégée des offres et des établissements", () => {
  it("duplique un établissement juste en dessous, sans son code ni sa confirmation", async () => {
    const c = await ouvrirEditeur();
    const nom1 = (champParLibelle(c, "Nom de l'établissement 1") as HTMLInputElement).value;
    const nom2 = (champParLibelle(c, "Nom de l'établissement 2") as HTMLInputElement).value;
    await cliquer(parTexte(c, "button", "Dupliquer l'établissement 1"));
    expect((champParLibelle(c, "Nom de l'établissement 2") as HTMLInputElement).value).toBe(`${nom1} (copie)`);
    expect((champParLibelle(c, "Nom de l'établissement 3") as HTMLInputElement).value).toBe(nom2);
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    const e = etablissements();
    expect(e[1]).not.toHaveProperty("code");
    expect(e[1]?.confirme).toBe(false);
  });

  it("duplique une offre juste en dessous, sans son code", async () => {
    const c = await ouvrirEditeur();
    const nom1 = (champParLibelle(c, "Nom de l'offre 1") as HTMLInputElement).value;
    await cliquer(parTexte(c, "button", "Dupliquer l'offre 1"));
    expect((champParLibelle(c, "Nom de l'offre 2") as HTMLInputElement).value).toBe(`${nom1} (copie)`);
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    const offres = (envoyes()[0]?.params as { offres: Array<Record<string, unknown>> }).offres;
    expect(offres[1]).not.toHaveProperty("code");
    expect(offres[1]?.confirmee).toBe(false);
  });

  it("préremplit les segments d'un nouveau bureau avec ceux des autres, sans doublon", async () => {
    const c = await ouvrirEditeur();
    await saisir(champParLibelle(c, "Segments suivis par l'établissement 1"), "proprietaires, medecins");
    await saisir(champParLibelle(c, "Segments suivis par l'établissement 2"), "medecins, avocats");
    const avant = c.querySelectorAll('[role="group"][aria-label^="Établissement"]').length;
    await cliquer(parTexte(c, "button", "Ajouter un établissement"));
    const nouveau = champParLibelle(c, `Segments suivis par l'établissement ${avant + 1}`) as HTMLInputElement;
    expect(nouveau.value).toBe("proprietaires, medecins, avocats");
  });
});

describe("segmentsDejaUtilises", () => {
  it("fusionne, nettoie et dédoublonne", () => {
    expect(segmentsDejaUtilises(["a, b", "", "b;c", " d "])).toBe("a, b, c, d");
    expect(segmentsDejaUtilises([])).toBe("");
  });
});
