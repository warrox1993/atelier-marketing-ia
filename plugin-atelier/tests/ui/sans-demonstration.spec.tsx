// @vitest-environment jsdom
/**
 * Lot G3 : l'interface ne se présente plus jamais comme une démonstration. Aucun rendu des vues
 * principales ne contient « Démonstration » ni « démo » : ni badge, ni mention, ni bouton de rechargement,
 * ni sélecteur de mode. Les textes qui viennent des DONNÉES (champs renvoyés par le serveur ou la passerelle)
 * ne sont pas ceux de l'interface : ils sont retirés avant la vérification, les autres lots les retirent à la source.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { ENTREPRISE, installerPont, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const T = "44444444-4444-4444-8444-444444444444";
const C = "33333333-3333-4333-8333-333333333333";

const VUES = [
  "accueil", "discussion", "prospects", "carte", "campagnes", `campagnes/${C}`, "contenus", `contenus/${T}`, "calendrier",
  "resultats", "equipe", "rapport", "mise-en-place", "marque", "connaissances", "parametres", "corbeille", "appels",
];

/** Toutes les chaînes des données d'exemple qui parlent de démonstration (texte de donnée, pas d'interface). */
function chainesDeDonnees(valeur: unknown, sortie: Set<string>): Set<string> {
  if (typeof valeur === "string") {
    if (/démo|demo/i.test(valeur) && valeur.length > 12) sortie.add(valeur);
  } else if (Array.isArray(valeur)) {
    for (const v of valeur) chainesDeDonnees(v, sortie);
  } else if (valeur && typeof valeur === "object") {
    for (const v of Object.values(valeur)) chainesDeDonnees(v, sortie);
  }
  return sortie;
}

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

describe("aucune présentation en démonstration dans l'interface", () => {
  const donnees = [...chainesDeDonnees(EXEMPLES_DONNEES, new Set())].sort((a, b) => b.length - a.length);
  it.each(VUES)("vue %s : ni « Démonstration » ni « démo » dans le rendu", async (vue) => {
    pont.chemin = `/RNO/atelier/${vue}`;
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    await new Promise((fin) => setTimeout(fin, 50));
    const c = rendu.conteneur;
    let texte = c.textContent ?? "";
    for (const d of donnees) texte = texte.split(d).join("");
    // Les titres et libellés issus des données (ex. « Page X (démonstration) ») sont retirés par fragments de parenthèses.
    texte = texte.replace(/\([^()]*démonstration[^()]*\)/giu, "");
    expect(texte.length, "la vue doit réellement s'afficher").toBeGreaterThan(100);
    expect(texte).not.toMatch(/démo/i);
    expect(c.querySelector(".atl-demo")).toBeNull();
    expect(c.querySelector('[data-ton="demo"]')).toBeNull();
    expect(c.querySelector('select option[value="demonstration"]')).toBeNull();
    expect(c.querySelector('input[type="radio"][value="demonstration"]')).toBeNull();
  });
});
