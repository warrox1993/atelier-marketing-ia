/**
 * Finitions mesurées de la feuille de style : contraste des textes atténués (clair et sombre), espace des onglets de
 * rubrique, padding vertical des boutons, cibles tactiles de 44 px sur téléphone.
 */
import { describe, expect, it } from "vitest";
import { STYLES_ATELIER } from "../../src/ui/styles.js";
import { STYLES_DEPARTEMENTS } from "../../src/ui/styles-departements.js";

/** Luminance relative d'un gris OKLCH (a = b = 0) : le canal linéaire vaut L au cube. */
const luminance = (l: number) => l ** 3;
const contraste = (a: number, b: number) => {
  const [haut, bas] = [Math.max(luminance(a), luminance(b)), Math.min(luminance(a), luminance(b))];
  return (haut + 0.05) / (bas + 0.05);
};
/** Mélange OKLab de deux gris : la clarté se mélange linéairement. */
const melange = (a: number, b: number, partA: number) => a * partA + b * (1 - partA);

describe("jetons de texte atténué", () => {
  const part = Number(/--atl-attenue: color-mix\(in oklab, var\(--muted-foreground, #6b6b6b\) (\d+)%, var\(--atl-texte\)\)/u.exec(STYLES_ATELIER)![1]) / 100;
  // Valeurs réelles de l'hôte (paperclip/ui/src/index.css) : clarté OKLCH des jetons.
  const clair = { fond: 1, surface: 1, grise: 0.97, texte: 0.145, attenue: 0.556 };
  const sombre = { fond: 0.205, surface: 0.205, grise: 0.269, texte: 0.985, attenue: 0.708 };

  for (const [nom, h] of [["clair", clair], ["sombre", sombre]] as const) {
    it(`--atl-attenue et --atl-attenue-fort font au moins 4,5:1 en thème ${nom}, sur le fond, la surface et la surface grisée`, () => {
      const attenue = melange(h.attenue, h.texte, part);
      const fort = melange(attenue, h.texte, 0.62);
      for (const surface of [h.fond, h.surface, h.grise]) {
        expect(contraste(attenue, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(fort, surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("le gris brut de l'hôte ne suffisait pas en clair sur la surface grisée (raison du mélange)", () => {
    expect(contraste(clair.attenue, clair.grise)).toBeLessThan(4.5);
  });
});

describe("finitions de la feuille", () => {
  it("les boutons ont un padding vertical (jamais 0) et les onglets de rubrique de l'air sous le libellé", () => {
    expect(STYLES_ATELIER).toMatch(/\.atl-bouton \{[^}]*padding: 0\.5rem 0\.875rem/u);
    expect(STYLES_ATELIER).not.toMatch(/\.atl-bouton \{[^}]*padding: 0 /u);
    expect(STYLES_ATELIER).toMatch(/\.atl-onglets-rub \[role="tab"\] \{[^}]*padding: 0\.25rem 0\.875rem 0\.5rem/u);
  });
  it("sur téléphone, boutons, onglets, entrées de menu et liens font 44 px au moins", () => {
    const telephone = STYLES_ATELIER.split("@media (max-width: 640px) {").slice(1).join("\n");
    for (const sel of [".atl-bouton, .atl-segment", ".atl-retour .atl-lien, .atl-table a.atl-lien", ".atl-nav a, .atl-onglets-rub [role=\"tab\"]"]) {
      expect(telephone, sel).toContain(`${sel}`);
    }
    expect(telephone).toMatch(/\.atl-nav a, \.atl-onglets-rub \[role="tab"\] \{ min-height: 2\.75rem; \}/u);
  });
});

describe("grille des départements : cible et focus du lien", () => {
  it("le lien d'une case fait 44 px au moins (20,8 px de ligne + 2 × 0,875 rem) sans agrandir la ligne du titre, et couvre toute la case", () => {
    const regle = /\.atl-dep-lien \{([^}]*)\}/u.exec(STYLES_DEPARTEMENTS)![1]!;
    const marge = Number(/padding-block: ([\d.]+)rem/u.exec(regle)![1]);
    expect(20.8 + 2 * marge * 16).toBeGreaterThanOrEqual(44);
    expect(regle).toContain(`margin-block: -${marge}rem`);
    expect(STYLES_DEPARTEMENTS).toMatch(/\.atl-dep-lien::after \{[^}]*inset: 0/u);
  });
  it("le focus clavier entoure toute la case avec le trait et le jeton du reste de l'atelier", () => {
    expect(STYLES_DEPARTEMENTS).toMatch(/\.atl-dep-case:has\(\.atl-dep-lien:focus-visible\) \{ outline: 2px solid var\(--atl-anneau\); outline-offset: 2px; \}/u);
    expect(STYLES_ATELIER).toMatch(/\.atl :focus-visible \{ outline: 2px solid var\(--atl-anneau\)/u);
  });
});
