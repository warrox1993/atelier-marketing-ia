/** Identités de projets (K3) : alias canoniques et résolution (FR-009). */
import { describe, expect, it } from "vitest";
import { canoniserAlias, resoudreProjet, type Alias } from "../src/serveur/observatoire/identites.js";

const gh = (valeur: string): Alias => ({ type: "github", valeur });

describe("identités de projets", () => {
  it("github.com/Morluto/REA.git et morluto/rea désignent le même projet", () => {
    expect(canoniserAlias(gh("https://github.com/Morluto/REA.git"))).toEqual(gh("morluto/rea"));
    expect(canoniserAlias(gh("github.com/Morluto/REA.git"))).toEqual(canoniserAlias(gh("morluto/rea")));
    const r = resoudreProjet([gh("github.com/Morluto/REA.git")], [{ projetId: "p1", alias: gh("morluto/rea") }]);
    expect(r).toEqual({ projetId: "p1", conflit: false });
  });
  it("alias inconnu → projet null", () => {
    const r = resoudreProjet([{ type: "npm", valeur: "Inconnu" }], [{ projetId: "p1", alias: gh("morluto/rea") }]);
    expect(r).toEqual({ projetId: null, conflit: false });
  });
  it("deux alias rattachés à deux projets → conflit", () => {
    const r = resoudreProjet(
      [gh("morluto/rea"), { type: "npm", valeur: "REA-cli" }],
      [
        { projetId: "p1", alias: gh("morluto/rea") },
        { projetId: "p2", alias: { type: "npm", valeur: "rea-cli" } },
      ],
    );
    expect(r.conflit).toBe(true);
  });
  it("canonise npm, site et nom", () => {
    expect(canoniserAlias({ type: "npm", valeur: "Foo" }).valeur).toBe("foo");
    expect(canoniserAlias({ type: "site", valeur: "https://Exemple.org/chemin/" }).valeur).toBe("https://exemple.org");
    expect(canoniserAlias({ type: "nom", valeur: "  Élan Vital " }).valeur).toBe("elan vital");
  });
});
