/**
 * Lecture RÉELLE d'une URL publique par le transport réseau protégé.
 * Test facultatif (réseau requis) : ATELIER_TEST_RESEAU=1 pnpm test.
 */
import { describe, expect, it } from "vitest";
import { lireUrl, transportReseau } from "../src/serveur/lecture-url.js";

const avecReseau = process.env.ATELIER_TEST_RESEAU === "1" ? describe : describe.skip;

avecReseau("lecture réelle (réseau)", () => {
  it("lit une page publique réelle et la classe accessible", async () => {
    const r = await lireUrl("https://example.com/", transportReseau, { pourLecture: true });
    expect(r.transport).toBe("reseau");
    expect(r.codeHttp).toBe(200);
    expect(r.statut).toBe("accessible");
    expect(r.titre).toMatch(/Example Domain/u);
  }, 20_000);

  it("une page réelle inexistante est inaccessible", async () => {
    const r = await lireUrl("https://example.com/page-inexistante-atelier", transportReseau, { pourLecture: false });
    expect(["inaccessible", "accessible", "page_erreur"]).toContain(r.statut);
    expect(r.codeHttp).not.toBeNull();
  }, 20_000);
});
