/** Clés de livrable de l'Observatoire : fiches et articles du magazine. */
import { describe, expect, it } from "vitest";
import { cleArticle, lireCleArticle, lireCleObservatoire } from "../src/serveur/observatoire/cles.js";

describe("clé d'article", () => {
  it("lit une clé valide", () => {
    expect(lireCleArticle("article-0-agents-cooperants-fr")).toEqual({ numero: 0, slug: "agents-cooperants", langue: "fr" });
    expect(lireCleArticle("article-12-x-en")).toEqual({ numero: 12, slug: "x", langue: "en" });
    expect(cleArticle(3, "outils", "en")).toBe("article-3-outils-en");
  });

  it.each(["article--x-fr", "article-1-fr", "article-01-x-fr", "article-1-X-fr", "article-1-x-de", "article-a-x-fr", "article-1--x-fr", "fiche-x-fr"])("refuse %s", (cle) => {
    expect(lireCleArticle(cle)).toBeNull();
  });

  it("lireCleObservatoire distingue fiche, article et clé inconnue", () => {
    expect(lireCleObservatoire("fiche-rea-fr")).toEqual({ type: "fiche", slug: "rea", langue: "fr" });
    expect(lireCleObservatoire("article-0-rea-en")).toEqual({ type: "article", slug: "rea", numero: 0, langue: "en" });
    expect(lireCleObservatoire("autre-livrable")).toBeNull();
  });
});
