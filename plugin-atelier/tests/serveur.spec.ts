import { describe, expect, it } from "vitest";
import { iso } from "../src/serveur/base.js";
import { avecCode } from "../src/serveur/atelier.js";
import { erreur } from "../src/serveur/erreurs.js";
import { libelleEvenement } from "../src/contrats/index.js";

describe("sérialisation et erreurs du pont (besoins du lot C)", () => {
  it("B-8 : la forme texte de PostgreSQL devient de l'ISO 8601 UTC", () => {
    expect(iso("2026-10-15 14:23:59.691232+02")).toBe("2026-10-15T12:23:59.691Z");
    expect(iso("2026-10-15T12:00:00Z")).toBe("2026-10-15T12:00:00.000Z");
    expect(iso(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10-15T12:00:00.000Z");
  });
  it("B-1 : le code stable précède le message transmis par le pont", async () => {
    await expect(avecCode(async () => erreur("revision_perimee", "Révision dépassée."))).rejects.toThrow("[revision_perimee] Révision dépassée.");
    await expect(avecCode(async () => { throw new Error("autre"); })).rejects.toThrow(/^autre$/u);
  });
  it("B-6 : libellé français d'un événement, type brut s'il est inconnu", () => {
    expect(libelleEvenement("porte.refusee")).toBe("Porte déterministe refusée");
    expect(libelleEvenement("type.inconnu")).toBe("type.inconnu");
  });
});
